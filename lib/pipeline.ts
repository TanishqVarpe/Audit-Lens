import { compareReports } from "./compare";
import { buildContext } from "./context";
import { inFocus } from "./diffmode";
import { askGemma, contextBudget, llmConfig } from "./gemma";
import { collectSources } from "./ingest";
import { runScout, scoutVersion } from "./scout";
import { runSlither, slitherVersion } from "./slither";
import { newReportId } from "./storage";
import type { AnalyzerFinding, FocusRange, Report, Severity } from "./types";
import { SEVERITY_ORDER } from "./types";
import { verifyFindings } from "./verify";

export interface AuditOptions {
  root: string;
  projectName: string;
  log?: (msg: string) => void;
  /** Diff mode: only audit these functions. */
  focus?: FocusRange[];
  /** Re-audit: the report this one is compared against. */
  parent?: Report;
  origin?: string;
}

export async function runAudit({ root, projectName, log = () => {}, focus, parent, origin }: AuditOptions): Promise<Report> {
  const started = Date.now();
  const warnings: string[] = [];

  // 1. Ingest
  const { chain, files, support } = await collectSources(root);
  if (!files.length) {
    throw new Error("No .sol or .rs files found (node_modules, lib, test, mocks and target folders are skipped).");
  }
  const tool = chain === "soroban" ? "scout" : "slither";
  const toolName = chain === "soroban" ? "Scout" : "Slither";
  log(`Found ${files.length} ${chain === "soroban" ? "Rust (Soroban)" : "Solidity"} file(s)`);

  // 2. Static analysis
  const version = chain === "soroban" ? await scoutVersion() : await slitherVersion();
  let analyzer: AnalyzerFinding[] = [];
  let toolOk = false;
  if (!version) {
    warnings.push(`${toolName} is not installed, so this is an AI-only review. Every finding is AI-suggested.`);
  } else {
    log(`Running ${toolName} ${version}...`);
    const s = chain === "soroban" ? await runScout(root) : await runSlither(root);
    toolOk = s.ok;
    analyzer = s.findings;
    if (!s.ok) warnings.push(`${toolName} failed, so this is an AI-only review: ${s.error}`);
    else log(`${toolName} found ${analyzer.length} issue(s)`);

    // Slither silently skips files it can't compile; say which ones it never saw.
    const analyzed = (s as { analyzed?: string[] }).analyzed; // Slither only
    if (s.ok && analyzed) {
      const done = new Set(analyzed);
      const missed = files.filter((f) => !done.has(f.path)).map((f) => f.path);
      if (missed.length === files.length) {
        toolOk = false;
        warnings.push(`${toolName} ran but could not compile any file (often a compiler version mismatch), so this is an AI-only review.`);
      } else if (missed.length) {
        const list = missed.slice(0, 5).join(", ") + (missed.length > 5 ? `, +${missed.length - 5} more` : "");
        warnings.push(`${toolName} could not compile ${missed.length} of ${files.length} file(s) (${list}), so findings in them are AI-only.`);
      }
      log(`${toolName} compiled ${files.length - missed.length}/${files.length} file(s)`);
    }
  }

  // Diff mode: only changed functions matter, and only their files go to the model.
  const focusFiles = focus ? new Set(focus.map((r) => r.file)) : null;
  if (focus) {
    analyzer = analyzer.filter((a) => a.lines.some((l) => inFocus(focus, a.file, l)));
    log(`Diff mode: ${focus.length} changed function(s) in ${focusFiles!.size} file(s)`);
  }
  const auditFiles = focusFiles ? files.filter((f) => focusFiles.has(f.path)) : files;

  // 3. Context
  const cfg = llmConfig();
  const ctx = buildContext(auditFiles, analyzer, contextBudget(cfg));
  log(`Context: ~${ctx.tokens} tokens (${ctx.excluded.length} excluded, ${ctx.truncated.length} truncated)`);
  if (ctx.excluded.length) warnings.push(`${ctx.excluded.length} file(s) without findings were left out to fit the context limit.`);
  if (ctx.truncated.length) warnings.push(`${ctx.truncated.length} file(s) were truncated to fit the context limit.`);

  // 4. LLM
  let raw: unknown[];
  let model: string;
  let mode: Report["mode"];
  if (cfg) {
    log(`Asking ${cfg.model}${cfg.provider === "ollama" ? " (local, Ollama)" : ""}...`);
    const focusNote = focus
      ? `DIFF MODE: only these functions changed. Report issues ONLY inside them:\n${focus.map((r) => `- ${r.name} (${r.file}:${r.start}-${r.end})`).join("\n")}`
      : "";
    raw = await askGemma(cfg, ctx.text, chain, focusNote);
    model = cfg.model;
    mode = toolOk ? "full" : "ai-only";
    log(`Model returned ${raw.length} finding(s)`);
  } else {
    if (!toolOk) {
      throw new Error(
        version
          ? `No LLM is configured and ${toolName} could not analyze this code, so there is nothing to report. ${warnings[warnings.length - 1] ?? ""}`.trim()
          : `No LLM is configured and ${toolName} is not installed, so there is nothing to analyze. Set JARVIS_API_KEY (or LLM_PROVIDER=ollama) or install ${toolName}.`,
      );
    }
    warnings.push(`No LLM configured (or MOCK_LLM=true): showing ${toolName} findings without AI explanations.`);
    raw = []; // verify step adds every tool finding back as "needs review"
    model = "none (tool-only)";
    mode = "tool-only";
  }

  // 5. Verify
  let { findings, dropped } = verifyFindings(raw, ctx.included, analyzer, tool);
  if (cfg && !toolOk) for (const f of findings) f.verified = f.verified && f.source === "ai";
  if (focus) {
    // Out of scope, not unverifiable, so these are not listed as removed by verification.
    const outside = findings.filter((f) => !inFocus(focus, f.file_name, f.line)).length;
    findings = findings.filter((f) => inFocus(focus, f.file_name, f.line)).map((f, i) => ({ ...f, id: `F-${String(i + 1).padStart(3, "0")}` }));
    if (outside) log(`Diff mode: ignored ${outside} finding(s) outside the changed functions`);
  }
  log(`Verified: kept ${findings.length}, removed ${dropped.length}`);

  // 6. Report
  const visible = findings.filter((f) => f.status !== "false_positive");
  const summary = Object.fromEntries(SEVERITY_ORDER.map((s) => [s, 0])) as Record<Severity, number>;
  for (const f of visible) summary[f.severity]++;

  const report: Report = {
    report_id: newReportId(),
    project_name: projectName,
    chain,
    analyzer: version ? `${tool} ${version}` : "none",
    model,
    mode,
    local_llm: cfg?.provider === "ollama" || undefined,
    files_analyzed: ctx.included.length,
    files_excluded: ctx.excluded,
    files_truncated: ctx.truncated,
    summary,
    counts: {
      tool_confirmed: visible.filter((f) => f.source !== "ai").length,
      ai_suggested: visible.filter((f) => f.source === "ai").length,
      false_positives: findings.length - visible.length,
    },
    dropped_findings: dropped,
    warnings,
    findings,
    duration_ms: Date.now() - started,
    created_at: new Date().toISOString(),
    sources: [...files, ...support],
    focus,
    origin,
  };
  if (parent) {
    report.parent_id = parent.report_id;
    report.comparison = compareReports(parent, report);
  }
  return report;
}
