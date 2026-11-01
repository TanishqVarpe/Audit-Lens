import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AnalyzerFinding, Severity } from "./types";

const run = promisify(execFile);

/** Scout (CoinFabrik) for Soroban. Installed with: cargo install cargo-scout-audit */
export async function scoutVersion(): Promise<string | null> {
  try {
    const { stdout } = await run("cargo", ["scout-audit", "--version"], { timeout: 15_000 });
    return stdout.trim().replace(/^cargo-scout-audit\s*/i, "") || "unknown";
  } catch {
    return null;
  }
}

/** SARIF URIs may be absolute file:// URLs or relative paths; make them project-relative. */
function relFile(dir: string, uri: string): string {
  let p = decodeURIComponent(uri.replace(/^file:\/\//, ""));
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // file:///C:/...
  const abs = path.resolve(dir, p);
  return path.relative(dir, abs).split(path.sep).join("/");
}

const LEVEL: Record<string, Severity> = {
  error: "high",
  critical: "critical",
  high: "high",
  warning: "medium",
  medium: "medium",
  minor: "low",
  low: "low",
  note: "info",
  enhancement: "optimization",
  none: "info",
};

/**
 * Run Scout with SARIF output and parse it. SARIF is a standard format, so we read
 * runs[].results[] defensively rather than depending on Scout-specific JSON.
 */
export async function runScout(dir: string): Promise<{ ok: boolean; findings: AnalyzerFinding[]; error?: string }> {
  const out = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "scout-")), "report.sarif");
  try {
    await run("cargo", ["scout-audit", "--output-format", "sarif", "--output-path", out], {
      cwd: dir,
      timeout: 600_000,
      maxBuffer: 50 * 1024 * 1024,
    }).catch((e: { stderr?: string; message?: string }) => {
      // Scout may exit non-zero when it finds issues; the report file is what matters.
      return fs.access(out).catch(() => {
        throw new Error((e.stderr || e.message || "Scout failed").slice(-800));
      });
    });
    const sarif = JSON.parse(await fs.readFile(out, "utf8"));
    const rules = new Map<string, any>();
    const findings: AnalyzerFinding[] = [];
    for (const r of sarif.runs ?? []) {
      for (const rule of r.tool?.driver?.rules ?? []) rules.set(rule.id, rule);
      for (const res of r.results ?? []) {
        const loc = res.locations?.[0]?.physicalLocation;
        const uri = String(loc?.artifactLocation?.uri ?? "");
        if (!uri) continue;
        const start = Number(loc?.region?.startLine) || 1;
        const end = Number(loc?.region?.endLine) || start;
        const rule = rules.get(res.ruleId);
        const sev = String(rule?.properties?.severity ?? res.level ?? "warning").toLowerCase();
        findings.push({
          id: `S-${String(findings.length + 1).padStart(3, "0")}`,
          check: String(res.ruleId ?? "scout"),
          severity: LEVEL[sev] ?? "medium",
          confidence: "n/a",
          description: String(res.message?.text ?? rule?.shortDescription?.text ?? "").trim(),
          file: relFile(dir, uri),
          lines: Array.from({ length: Math.min(end - start + 1, 50) }, (_, i) => start + i),
        });
      }
    }
    return { ok: true, findings };
  } catch (e) {
    return { ok: false, findings: [], error: (e as Error).message };
  } finally {
    await fs.rm(path.dirname(out), { recursive: true, force: true }).catch(() => {});
  }
}
