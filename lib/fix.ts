import { createTwoFilesPatch } from "diff";
import { checkPatch } from "./compile";
import { chatJson, parseJsonObject, type LlmConfig } from "./gemma";
import { numberFile } from "./ingest";
import { FIX_PROMPT } from "./prompt";
import type { Finding, FixResult, Report, SourceFile } from "./types";

/** The report's code with any applied fixes laid over the original. */
export function currentFiles(r: Report): SourceFile[] {
  return (r.sources ?? []).map((f) => ({ path: f.path, content: r.working?.[f.path] ?? f.content }));
}

interface Edit {
  start_line: number;
  end_line: number;
  replacement: string;
}

/** Apply line-range edits. Throws on ranges that don't fit the file or overlap. */
export function applyEdits(content: string, edits: Edit[]): string {
  const lines = content.split("\n");
  const sorted = [...edits].sort((a, b) => b.start_line - a.start_line);
  let floor = Infinity;
  for (const e of sorted) {
    const start = Math.trunc(Number(e.start_line));
    const end = Math.trunc(Number(e.end_line));
    if (!(start >= 1 && start <= lines.length + 1 && end >= start - 1 && end <= lines.length)) {
      throw new Error(`edit range ${start}-${end} is outside the file (1-${lines.length})`);
    }
    if (end >= floor) throw new Error("edits overlap");
    floor = start;
    const repl = String(e.replacement ?? "").replace(/\r\n/g, "\n");
    lines.splice(start - 1, end - start + 1, ...(repl === "" ? [] : repl.split("\n")));
  }
  return lines.join("\n");
}

export async function generateFix(cfg: LlmConfig, report: Report, finding: Finding): Promise<FixResult> {
  const files = currentFiles(report);
  const file = files.find((f) => f.path === finding.file_name);
  if (!file) throw new Error("The source for this finding is not stored in the report (re-run the audit).");

  const ask = [
    numberFile(file),
    "",
    `## FINDING TO FIX`,
    `${finding.title} (${finding.severity}, ${finding.vulnerability_type})`,
    `Reported at line ${finding.line} of the original file: ${finding.code_quote}`,
    `Explanation: ${finding.explanation}`,
    `Suggested fix: ${finding.suggested_fix}`,
    report.working?.[file.path] ? "Note: earlier fixes were already applied to this file, so lines may have moved." : "",
  ].join("\n");

  const { summary, patched } = await chatJson(
    cfg,
    [
      { role: "system", content: FIX_PROMPT },
      { role: "user", content: ask },
    ],
    (text) => {
      const obj = parseJsonObject(text);
      if (!Array.isArray(obj.edits) || !obj.edits.length) throw new Error('no "edits" array');
      const out = applyEdits(file.content, obj.edits as Edit[]);
      if (out === file.content) throw new Error("the edits do not change the file");
      return { summary: String(obj.summary ?? ""), patched: out };
    },
  );

  const diff = createTwoFilesPatch(`a/${file.path}`, `b/${file.path}`, file.content, patched, "", "", { context: 3 })
    .split("\n")
    .slice(1) // drop the "=====" separator line
    .join("\n");
  const after = files.map((f) => (f.path === file.path ? { ...f, content: patched } : f));
  const check = await checkPatch(report.chain, [...files], after, file.path);

  return {
    file: file.path,
    patched,
    diff,
    compiles: check.compiles,
    compiler: check.compiler,
    compile_note: check.note,
    summary,
    applied: false,
    base_fixes: report.findings.filter((o) => o.id !== finding.id && o.fix?.applied && o.fix.file === file.path).map((o) => o.id),
    created_at: new Date().toISOString(),
  };
}
