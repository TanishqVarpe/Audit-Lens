import { extractFunctions } from "./contractmap";
import { riskScore } from "./score";
import type { Comparison, Finding, Report, Severity } from "./types";
import { SEVERITY_ORDER } from "./types";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const visible = (r: Report) => r.findings.filter((f) => f.status !== "false_positive");

interface Located {
  f: Finding;
  fn: string; // enclosing function id, "" if none
  primary: string; // the tool check, or the model's issue type
  kinds: Set<string>; // primary + checks merged into it
}

/** Attach the enclosing function to each finding. Functions keep their names when lines move. */
function locate(r: Report): Located[] {
  const fns = new Map((r.sources ?? []).map((s) => [s.path, extractFunctions(s)]));
  return visible(r).map((f) => {
    const fn = fns.get(f.file_name)?.find((x) => f.line >= x.start && f.line <= x.end)?.id ?? "";
    const primary = norm(f.slither_check || f.vulnerability_type);
    return { f, fn, primary, kinds: new Set([primary, ...(f.merged_checks ?? []).map(norm)]) };
  });
}

const band = (s: Severity) => (SEVERITY_ORDER.indexOf(s) <= 1 ? 0 : SEVERITY_ORDER.indexOf(s) <= 3 ? 1 : 2);
const place = (x: Located, y: Located) =>
  x.f.file_name === y.f.file_name && (x.fn && y.fn ? x.fn === y.fn : Math.abs(x.f.line - y.f.line) <= 3);

/**
 * Is `issue`'s problem still present among `others`? The model labels the same bug
 * differently between runs, so labels are only one signal:
 *  - same place and `issue`'s main check/type appears in another finding (incl. merged checks)
 *  - or, when the model is involved (AI on either side), same place and the same code line
 *    or the same severity band (critical/high, medium/low, info).
 */
function present(issue: Located, others: Located[]): boolean {
  return others.some((o) => {
    if (!place(issue, o)) return false;
    if (o.kinds.has(issue.primary)) return true;
    const ai = issue.f.source === "ai" || o.f.source === "ai";
    return ai && (norm(issue.f.code_quote) === norm(o.f.code_quote) || band(issue.f.severity) === band(o.f.severity));
  });
}

export function compareReports(parent: Report, child: Report): Comparison {
  const before = locate(parent);
  const after = locate(child);
  const brief = (x: Located) => ({ title: x.f.title, severity: x.f.severity, file_name: x.f.file_name });
  return {
    parent_id: parent.report_id,
    before: parent.summary,
    after: child.summary,
    grade_before: riskScore(parent.summary).grade,
    grade_after: riskScore(child.summary).grade,
    // Fixed: its main issue no longer appears anywhere nearby, even merged into another finding.
    fixed: before.filter((b) => !present(b, after)).map(brief),
    // New: nothing before covered it, not even as a merged duplicate.
    added: after.filter((a) => !present(a, before)).map(brief),
  };
}
