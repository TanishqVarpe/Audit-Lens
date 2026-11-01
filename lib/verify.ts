import type { AnalyzerFinding, Finding, Severity, SourceFile } from "./types";
import { SEVERITY_ORDER } from "./types";
import { swcFor } from "./swc";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const LINE_TOLERANCE = 3;

export interface VerifyResult {
  findings: Finding[];
  dropped: { title: string; reason: string }[];
}

function asSeverity(v: unknown): Severity {
  const s = String(v ?? "").toLowerCase();
  if (s === "informational") return "info";
  return (SEVERITY_ORDER as string[]).includes(s) ? (s as Severity) : "info";
}

export function findFile(files: SourceFile[], name: string): SourceFile | undefined {
  const n = name.replace(/\\/g, "/").replace(/^\.\//, "");
  return files.find((f) => f.path === n) ?? files.find((f) => f.path.endsWith("/" + n) || n.endsWith("/" + f.path));
}

/** 1-based line numbers where the (normalized) quote appears. */
export function locate(file: SourceFile, quote: string): number[] {
  const q = norm(quote);
  if (!q) return [];
  const lines = file.content.split("\n");
  const hits: number[] = [];
  lines.forEach((l, i) => {
    if (norm(l).includes(q)) hits.push(i + 1);
  });
  if (hits.length) return hits;
  // Multi-line quote: match on its first non-empty line.
  const first = norm(quote.split("\n").find((l) => l.trim()) ?? "");
  if (first && first !== q && norm(file.content).includes(q)) {
    lines.forEach((l, i) => {
      if (norm(l).includes(first)) hits.push(i + 1);
    });
  }
  return hits;
}

/** Nearest hit to the line the model claimed. */
export function nearest(hits: number[], claimed: number): number {
  return hits.reduce((a, b) => (Math.abs(b - claimed) < Math.abs(a - claimed) ? b : a));
}

function matchAnalyzer(f: { file: string; line: number; check?: string }, analyzer: AnalyzerFinding[]) {
  return analyzer.find(
    (a) =>
      a.file === f.file &&
      (a.check === f.check || !f.check) &&
      a.lines.some((l) => Math.abs(l - f.line) <= LINE_TOLERANCE),
  ) ?? analyzer.find((a) => a.file === f.file && a.check === f.check);
}

/**
 * The trust layer. Everything the LLM says is checked against the real source:
 * file exists, quote exists, line is right, tool claims match a real tool finding.
 * Tool findings the LLM skipped are added back so the AI can never hide a tool finding.
 */
export function verifyFindings(
  raw: unknown[],
  files: SourceFile[],
  analyzer: AnalyzerFinding[],
  tool: "slither" | "scout" = "slither",
): VerifyResult {
  const toolName = tool === "scout" ? "Scout" : "Slither";
  const kept: Finding[] = [];
  const dropped: VerifyResult["dropped"] = [];
  const rank = (s: Severity) => SEVERITY_ORDER.indexOf(s);
  /** Tool findings the model actually addressed (matched, or listed as merged). */
  const reviewed = new Set<AnalyzerFinding>();

  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const title = String(r.title || r.vulnerability_type || "Untitled finding");
    const file = findFile(files, String(r.file_name ?? ""));
    if (!file) {
      dropped.push({ title, reason: `file "${r.file_name}" does not exist` });
      continue;
    }

    const quote = String(r.code_quote ?? "");
    const claimedLine = Number(r.line) || 0;
    const hits = locate(file, quote);
    let source: Finding["source"] = r.source === "slither" || r.source === "scout" ? tool : "ai";
    const check = r.slither_check ? String(r.slither_check) : undefined;
    let note: string | undefined;

    let line = claimedLine;
    if (hits.length) {
      const best = nearest(hits, claimedLine);
      if (best !== claimedLine) note = `line corrected ${claimedLine} → ${best}`;
      line = best;
    }

    const match = source !== "ai" ? matchAnalyzer({ file: file.path, line, check }, analyzer) : undefined;

    if (!hits.length) {
      if (match) {
        // Real tool finding but the model misquoted: keep, using the tool's location.
        line = match.lines[0] ?? claimedLine;
        note = `AI quote did not match the source; location taken from ${toolName}`;
      } else {
        dropped.push({ title, reason: "quoted code not found in the file" });
        continue;
      }
    }

    if (source !== "ai" && !match) {
      source = "ai";
      note = [note, `claimed as a ${toolName} finding but no matching ${toolName} result; relabelled AI`].filter(Boolean).join("; ");
    }

    const status = ["confirmed", "false_positive", "needs_review"].includes(String(r.status))
      ? (r.status as Finding["status"])
      : source === "ai" ? "needs_review" : "confirmed";

    const lineText = file.content.split("\n")[line - 1] ?? quote;
    const severity = asSeverity(r.severity);
    let mergedChecks: string[] = [];

    if (match) {
      reviewed.add(match);
      // Say so when the AI rates a tool finding much higher than the tool did.
      if (rank(match.severity) - rank(severity) >= 2) {
        note = [note, `AI rated this ${severity}; ${toolName} rated its finding ${match.severity}`].filter(Boolean).join("; ");
      }
      // Duplicates the model merged into this finding (only real IDs in the same file count).
      const merged = (Array.isArray(r.slither_ids) ? r.slither_ids : [])
        .map((id) => analyzer.find((a) => a.id === String(id) && a.file === file.path && a !== match))
        .filter((a): a is AnalyzerFinding => !!a);
      for (const a of merged) reviewed.add(a);
      if (merged.length) note = [note, `merged ${merged.map((a) => `${a.check} (${a.id})`).join(", ")}`].filter(Boolean).join("; ");
      mergedChecks = [...new Set(merged.map((a) => a.check))];
    }
    const steps = Array.isArray(r.attack_scenario)
      ? r.attack_scenario.map((x) => String(x).trim()).filter(Boolean).slice(0, 8)
      : [];

    kept.push({
      id: "",
      title,
      file_name: file.path,
      line,
      code_quote: hits.length ? lineText.trim() : quote,
      vulnerability_type: String(r.vulnerability_type ?? "Other"),
      severity,
      source,
      slither_check: source !== "ai" ? (match?.check ?? check) : undefined,
      merged_checks: mergedChecks.length ? mergedChecks : undefined,
      status: source === "ai" && status === "confirmed" ? "needs_review" : status,
      explanation: String(r.explanation ?? ""),
      suggested_fix: String(r.suggested_fix ?? ""),
      simple_explanation: r.simple_explanation ? String(r.simple_explanation) : undefined,
      swc_id: tool === "slither" ? swcFor(r.swc_id, match?.check ?? check, String(r.vulnerability_type ?? "")) : undefined,
      attack_scenario: steps.length && (severity === "critical" || severity === "high") ? steps : undefined,
      verified: hits.length > 0 && (source === "ai" || !!match),
      verification_note: note,
    });
  }

  // Add back any tool finding the model ignored.
  for (const a of analyzer) {
    if (reviewed.has(a)) continue;
    const file = files.find((f) => f.path === a.file);
    const line = a.lines[0] ?? 1;
    kept.push({
      id: "",
      title: `${a.check} (not reviewed by AI)`,
      file_name: a.file,
      line,
      code_quote: (file?.content.split("\n")[line - 1] ?? "").trim(),
      vulnerability_type: a.check,
      severity: a.severity,
      source: tool,
      slither_check: a.check,
      status: "needs_review",
      explanation: a.description,
      suggested_fix: `Review manually. See the ${toolName} detector documentation for this check.`,
      swc_id: tool === "slither" ? swcFor(undefined, a.check, a.check) : undefined,
      verified: true,
      verification_note: `${toolName} finding the AI did not address; added back automatically`,
    });
  }

  // De-duplicate by file + line + type, keep the more severe one.
  const unique = new Map<string, Finding>();
  for (const f of kept) {
    const key = `${f.file_name}:${f.line}:${f.vulnerability_type.toLowerCase()}`;
    const prev = unique.get(key);
    if (!prev || rank(f.severity) < rank(prev.severity)) unique.set(key, f);
  }

  const findings = [...unique.values()]
    .sort((a, b) => rank(a.severity) - rank(b.severity) || a.file_name.localeCompare(b.file_name) || a.line - b.line)
    .map((f, i) => ({ ...f, id: `F-${String(i + 1).padStart(3, "0")}` }));

  return { findings, dropped };
}
