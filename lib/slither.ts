import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { AnalyzerFinding, Severity } from "./types";

const run = promisify(execFile);

const IMPACT: Record<string, Severity> = {
  High: "high",
  Medium: "medium",
  Low: "low",
  Informational: "info",
  Optimization: "optimization",
};

export async function slitherVersion(): Promise<string | null> {
  try {
    const { stdout } = await run("slither", ["--version"], { timeout: 15_000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

export interface SlitherResult {
  ok: boolean;
  findings: AnalyzerFinding[];
  error?: string;
  /** Files Slither actually compiled. It skips files it can't compile without saying so. */
  analyzed?: string[];
}

const relPath = (p: string) => p.replace(/\\/g, "/").replace(/^\.\//, "");

/** Run Slither on a directory and return simplified findings. */
export async function runSlither(dir: string): Promise<SlitherResult> {
  let stdout = "";
  try {
    // "compilations" lists the compiled source units (with ASTs, hence the large buffer).
    const r = await run("slither", [".", "--json", "-", "--exclude-dependencies", "--json-types", "detectors,compilations"], {
      cwd: dir,
      timeout: 300_000,
      maxBuffer: 300 * 1024 * 1024,
    });
    stdout = r.stdout;
  } catch (e: unknown) {
    // Slither exits non-zero when it finds issues, but still prints JSON.
    const err = e as { stdout?: string; stderr?: string; message?: string; code?: number | string; killed?: boolean };
    stdout = err.stdout ?? "";
    if (!stdout.trim()) {
      const error = err.killed
        ? "Slither timed out."
        : err.stderr?.trim() ||
          (typeof err.code === "number"
            ? `Slither exited with code ${err.code} without output. Usually the code doesn't compile with the installed solc: check the pragma version (solc-select can install others).`
            : err.message || "Slither failed");
      return { ok: false, findings: [], error: error.slice(-800) };
    }
  }

  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    return { ok: false, findings: [], error: "Could not parse Slither JSON output." };
  }
  if (!json.success) {
    return { ok: false, findings: [], error: String(json.error ?? "Slither reported failure (compile error?)").slice(-800) };
  }

  const detectors: any[] = json.results?.detectors ?? [];
  const findings: AnalyzerFinding[] = [];
  for (const d of detectors) {
    const el = (d.elements ?? []).find((x: any) => x.source_mapping?.filename_relative);
    const sm = el?.source_mapping;
    if (!sm) continue;
    findings.push({
      id: `S-${String(findings.length + 1).padStart(3, "0")}`,
      check: d.check,
      severity: IMPACT[d.impact] ?? "info",
      confidence: d.confidence,
      description: String(d.description ?? "").trim(),
      file: relPath(String(sm.filename_relative)),
      lines: sm.lines ?? [],
    });
  }
  const analyzed = new Set<string>();
  for (const c of json.results?.compilations ?? []) {
    for (const unit of Object.values<any>(c.compilation_units ?? {})) {
      for (const p of Object.keys(unit.source_units ?? {})) analyzed.add(relPath(path.isAbsolute(p) ? path.relative(dir, p) : p));
    }
  }
  return { ok: true, findings, analyzed: [...analyzed] };
}
