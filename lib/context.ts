import { numberFile } from "./ingest";
import type { AnalyzerFinding, SourceFile } from "./types";

/** Rough token estimate (~4 chars per token). Good enough for budgeting. */
export const estimateTokens = (s: string) => Math.ceil(s.length / 4);

export interface BuiltContext {
  text: string;
  tokens: number;
  included: SourceFile[];
  excluded: string[];
  truncated: string[];
}

/**
 * Findings first, then files. If over budget: drop files with no findings
 * (largest first), then truncate the largest remaining files.
 */
export function buildContext(files: SourceFile[], findings: AnalyzerFinding[], maxTokens: number): BuiltContext {
  const findingsText = findings.length
    ? findings
        .map((f) => `[${f.id}] ${f.check} | impact=${f.severity} | confidence=${f.confidence} | ${f.file}:${f.lines[0] ?? "?"}\n${f.description}`)
        .join("\n\n")
    : "(no static analyzer findings available)";
  const header = `## STATIC ANALYZER FINDINGS (Slither)\n${findingsText}\n\n## CONTRACT FILES\n`;

  const flagged = new Set(findings.map((f) => f.file));
  let included = [...files];
  const excluded: string[] = [];
  const truncated: string[] = [];
  const size = (fs: SourceFile[]) => estimateTokens(header) + fs.reduce((n, f) => n + estimateTokens(numberFile(f)), 0);

  // 1. Drop unflagged files, largest first.
  const unflagged = included.filter((f) => !flagged.has(f.path)).sort((a, b) => b.content.length - a.content.length);
  for (const f of unflagged) {
    if (size(included) <= maxTokens) break;
    included = included.filter((x) => x !== f);
    excluded.push(f.path);
  }

  // 2. Truncate largest remaining files.
  while (size(included) > maxTokens && included.length) {
    const biggest = [...included].sort((a, b) => b.content.length - a.content.length)[0];
    const over = size(included) - maxTokens;
    const keepChars = Math.max(2000, biggest.content.length - over * 4 - 200);
    if (keepChars >= biggest.content.length) break;
    included = included.map((f) =>
      f === biggest ? { ...f, content: f.content.slice(0, keepChars) + "\n// ... [truncated by AuditLens: file too large]" } : f,
    );
    if (!truncated.includes(biggest.path)) truncated.push(biggest.path);
    if (keepChars === 2000) break;
  }

  const text = header + included.map(numberFile).join("\n\n");
  return { text, tokens: estimateTokens(text), included, excluded, truncated };
}
