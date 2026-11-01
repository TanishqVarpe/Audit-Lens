import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { riskScore } from "./score";
import type { Report, Severity } from "./types";
import { SEVERITY_ORDER } from "./types";

const dir = () => path.resolve(process.env.REPORTS_DIR || path.join(process.cwd(), "reports"));
const ID_RE = /^[a-z0-9-]{6,64}$/;

export function newReportId(): string {
  const d = new Date().toISOString().slice(0, 10);
  return `${d}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveReport(r: Report): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(path.join(dir(), `${r.report_id}.json`), JSON.stringify(r, null, 2));
  try {
    upsertIndex(r);
  } catch (e) {
    console.warn("[storage] history index not updated:", (e as Error).message);
  }
}

export async function loadReport(id: string): Promise<Report | null> {
  if (!ID_RE.test(id)) return null;
  try {
    const r = JSON.parse(await fs.readFile(path.join(dir(), `${id}.json`), "utf8")) as Report;
    r.chain ??= "solidity"; // reports saved before multi-chain support
    return r;
  } catch {
    return null;
  }
}

/** Load, change and save a report (used by fix / exploit / apply actions). */
export async function updateReport(id: string, mutate: (r: Report) => void | Promise<void>): Promise<Report | null> {
  const r = await loadReport(id);
  if (!r) return null;
  await mutate(r);
  await saveReport(r);
  return r;
}

// ---------------------------------------------------------------------------
// History index (SQLite). The JSON files stay the source of truth; the index can
// always be rebuilt from them, so a missing or deleted DB is never a problem.

export interface ReportRow {
  report_id: string;
  project_name: string;
  created_at: string;
  chain: string;
  mode: string;
  grade: string;
  score: number;
  findings: number;
  parent_id: string | null;
  origin: string | null;
  summary: Record<Severity, number>;
}

type Sqlite = typeof import("node:sqlite");
let db: InstanceType<Sqlite["DatabaseSync"]> | null = null;

function openDb() {
  if (db) return db;
  // getBuiltinModule keeps the bundler away from node:sqlite.
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as Sqlite;
  mkdirSync(dir(), { recursive: true });
  db = new DatabaseSync(path.join(dir(), "history.db"));
  db.exec(`CREATE TABLE IF NOT EXISTS reports (
    report_id TEXT PRIMARY KEY, project_name TEXT, created_at TEXT, chain TEXT, mode TEXT,
    grade TEXT, score INTEGER, findings INTEGER, parent_id TEXT, origin TEXT,
    critical INTEGER, high INTEGER, medium INTEGER, low INTEGER, info INTEGER, optimization INTEGER)`);
  return db;
}

function upsertIndex(r: Report) {
  const { grade, score } = riskScore(r.summary);
  const visible = r.findings.filter((f) => f.status !== "false_positive").length;
  openDb()
    .prepare(
      `INSERT OR REPLACE INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      r.report_id, r.project_name, r.created_at, r.chain ?? "solidity", r.mode, grade, score, visible,
      r.parent_id ?? null, r.origin ?? null, ...SEVERITY_ORDER.map((s) => r.summary[s] ?? 0),
    );
}

/** Index any JSON reports the DB doesn't know about yet (first run, or DB deleted). */
async function backfill() {
  const d = openDb();
  const known = new Set((d.prepare("SELECT report_id FROM reports").all() as { report_id: string }[]).map((x) => x.report_id));
  const files = await fs.readdir(dir()).catch(() => [] as string[]);
  for (const f of files) {
    const id = f.replace(/\.json$/, "");
    if (!f.endsWith(".json") || known.has(id)) continue;
    const r = await loadReport(id);
    if (r) upsertIndex(r);
  }
}

export async function listReports(project?: string): Promise<ReportRow[]> {
  await backfill();
  const rows = (
    project
      ? openDb().prepare("SELECT * FROM reports WHERE project_name = ? ORDER BY created_at DESC").all(project)
      : openDb().prepare("SELECT * FROM reports ORDER BY created_at DESC").all()
  ) as Record<string, unknown>[];
  return rows.map((x) => ({
    report_id: String(x.report_id),
    project_name: String(x.project_name),
    created_at: String(x.created_at),
    chain: String(x.chain),
    mode: String(x.mode),
    grade: String(x.grade),
    score: Number(x.score),
    findings: Number(x.findings),
    parent_id: (x.parent_id as string) ?? null,
    origin: (x.origin as string) ?? null,
    summary: Object.fromEntries(SEVERITY_ORDER.map((s) => [s, Number(x[s] ?? 0)])) as Record<Severity, number>,
  }));
}
