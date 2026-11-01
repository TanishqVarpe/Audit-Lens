import { riskScore } from "./score";
import { SWC, swcUrl } from "./swc";
import type { Comparison, Finding, Report } from "./types";
import { SEVERITY_ORDER } from "./types";

export const TOOL_LABEL: Record<Finding["source"], string> = { slither: "Slither", scout: "Scout", ai: "AI" };

/** "High: 2 → 0 · Medium: 1 → 1" for the severities that were non-zero in either run. */
export function comparisonLine(c: Comparison): string {
  return SEVERITY_ORDER.filter((s) => c.before[s] || c.after[s])
    .map((s) => `${s[0].toUpperCase()}${s.slice(1)}: ${c.before[s]} → ${c.after[s]}`)
    .join(" · ") || "No findings before or after";
}

export function toMarkdown(r: Report): string {
  const out: string[] = [];
  const risk = riskScore(r.summary);
  out.push(`# AuditLens report: ${r.project_name}`, "");
  out.push(`> Automated first-pass review. Not a substitute for a professional audit.`, "");
  out.push(`**Risk grade: ${risk.grade}** (${risk.score}/100, ${risk.reason})`, "");
  out.push(`- **Report ID:** ${r.report_id}`);
  out.push(`- **Date:** ${new Date(r.created_at).toUTCString()}`);
  out.push(`- **Chain:** ${r.chain}`);
  if (r.origin) out.push(`- **Source:** ${r.origin}`);
  out.push(`- **Analyzer:** ${r.analyzer}`);
  out.push(`- **Model:** ${r.model}${r.local_llm ? " (local, code never left the machine)" : ""}`);
  out.push(`- **Mode:** ${r.mode}`);
  out.push(`- **Files analyzed:** ${r.files_analyzed}`);
  if (r.files_excluded.length) out.push(`- **Files excluded (size):** ${r.files_excluded.join(", ")}`);
  if (r.files_truncated.length) out.push(`- **Files truncated (size):** ${r.files_truncated.join(", ")}`);
  if (r.focus?.length) out.push(`- **Diff mode:** only ${r.focus.length} changed function(s) audited: ${r.focus.map((f) => f.name).join(", ")}`);
  out.push("");

  if (r.comparison) {
    const c = r.comparison;
    out.push("## Compared with the previous audit", "");
    out.push(`- ${comparisonLine(c)}`);
    out.push(`- Grade: ${c.grade_before} → ${c.grade_after}`);
    out.push(`- Fixed: ${c.fixed.map((f) => f.title).join(", ") || "none"}`);
    out.push(`- New: ${c.added.map((f) => f.title).join(", ") || "none"}`, "");
  }

  out.push("## Summary", "", "| Severity | Count |", "|---|---|");
  for (const s of SEVERITY_ORDER) out.push(`| ${s} | ${r.summary[s]} |`);
  out.push("");
  out.push(
    `Tool-confirmed: **${r.counts.tool_confirmed}** · AI-suggested: **${r.counts.ai_suggested}** · False positives: **${r.counts.false_positives}** · Unverifiable AI findings removed: **${r.dropped_findings.length}**`,
    "",
  );
  if (r.warnings.length) {
    out.push("### Warnings", "", ...r.warnings.map((w) => `- ${w}`), "");
  }

  const lang = r.chain === "soroban" ? "rust" : "solidity";
  out.push("## Findings", "");
  for (const f of r.findings) {
    out.push(`### ${f.id} · [${f.severity.toUpperCase()}] ${f.title}`, "");
    out.push(`- **Location:** \`${f.file_name}:${f.line}\``);
    out.push(`- **Type:** ${f.vulnerability_type}`);
    if (f.swc_id) out.push(`- **SWC:** [${f.swc_id} ${SWC[f.swc_id]?.title ?? ""}](${swcUrl(f.swc_id)})`);
    out.push(`- **Source:** ${f.source === "ai" ? "AI-suggested" : `Tool-confirmed (${TOOL_LABEL[f.source]}: ${f.slither_check})`}`);
    out.push(`- **Status:** ${f.status.replace("_", " ")}${f.verified ? " · verified against source" : " · not verified"}`);
    if (f.verification_note) out.push(`- **Verification note:** ${f.verification_note}`);
    if (f.exploit) out.push(`- **Exploit test:** ${f.exploit.status === "confirmed" ? "✓ Exploit confirmed by forge test" : f.exploit.status.replace("_", " ")}`);
    out.push("", "```" + lang, f.code_quote, "```", "");
    out.push(`**Explanation.** ${f.explanation}`, "");
    if (f.simple_explanation) out.push(`**In plain words.** ${f.simple_explanation}`, "");
    if (f.attack_scenario?.length) {
      out.push("**Attack scenario.**", "", ...f.attack_scenario.map((s, i) => `${i + 1}. ${s}`), "");
    }
    if (f.suggested_fix.trim()) out.push(`**Suggested fix.** ${f.suggested_fix}`, "");
    if (f.fix) {
      const status = f.fix.compiles === true ? "✓ compiles" : f.fix.compiles === false ? "✗ does not compile" : "compile check unavailable";
      out.push(`**Generated patch** (${status}, ${f.fix.compiler}${f.fix.applied ? ", applied" : ""}):`, "", "```diff", f.fix.diff.trim(), "```", "");
    }
  }

  if (r.dropped_findings.length) {
    out.push("## Removed by verification", "");
    for (const d of r.dropped_findings) out.push(`- ${d.title}: ${d.reason}`);
    out.push("");
  }
  return out.join("\n");
}
