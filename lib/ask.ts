import { buildContext } from "./context";
import { chatJson, contextBudget, parseJsonObject, type LlmConfig, type Msg } from "./gemma";
import { ASK_PROMPT } from "./prompt";
import type { Report } from "./types";
import { findFile, locate, nearest } from "./verify";

export interface Citation {
  file_name: string;
  line: number;
  code_quote: string;
  verified: boolean;
  note?: string;
}

export interface Answer {
  answer: string;
  citations: Citation[];
}

/**
 * Answer a question about the audited code. Every cited line goes through the same
 * quote check as findings: the file must exist and the quote must be on that line.
 */
export async function askAboutCode(
  cfg: LlmConfig,
  report: Report,
  question: string,
  history: { q: string; a: string }[] = [],
): Promise<Answer> {
  // The audited code (not the working copy with applied fixes), so answers, line numbers
  // and the code view all describe the same version. Contracts only: build files would eat the context.
  const files = (report.sources ?? []).filter((f) => /\.(sol|rs)$/.test(f.path));
  if (!files.length) throw new Error("This report has no stored source (re-run the audit to enable Q&A).");
  const ctx = buildContext(files, [], contextBudget(cfg));
  const findings = report.findings
    .filter((f) => f.status !== "false_positive")
    .map((f) => `- [${f.severity}] ${f.title} (${f.file_name}:${f.line})`)
    .join("\n");

  const messages: Msg[] = [
    { role: "system", content: ASK_PROMPT },
    { role: "user", content: `${ctx.text}\n\n## AUDIT FINDINGS ALREADY REPORTED\n${findings || "(none)"}` },
    { role: "assistant", content: '{"answer": "Ready. Ask me about this code.", "citations": []}' },
    ...history.slice(-4).flatMap((h): Msg[] => [
      { role: "user", content: h.q },
      { role: "assistant", content: JSON.stringify({ answer: h.a, citations: [] }) },
    ]),
    { role: "user", content: question },
  ];

  const raw = await chatJson(cfg, messages, (text) => {
    const obj = parseJsonObject(text);
    if (typeof obj.answer !== "string") throw new Error('no "answer" string');
    return obj as { answer: string; citations?: unknown[] };
  });

  const citations: Citation[] = (Array.isArray(raw.citations) ? raw.citations : []).slice(0, 12).map((c) => {
    const r = (c ?? {}) as Record<string, unknown>;
    const name = String(r.file_name ?? "");
    const quote = String(r.code_quote ?? "");
    const claimed = Number(r.line) || 0;
    const file = findFile(files, name);
    if (!file) return { file_name: name, line: claimed, code_quote: quote, verified: false, note: "file does not exist" };
    const hits = locate(file, quote);
    if (!hits.length) return { file_name: file.path, line: claimed, code_quote: quote, verified: false, note: "quoted code not found" };
    const line = nearest(hits, claimed);
    return {
      file_name: file.path,
      line,
      code_quote: file.content.split("\n")[line - 1].trim(),
      verified: true,
      note: line !== claimed ? `line corrected ${claimed} → ${line}` : undefined,
    };
  });

  return { answer: raw.answer, citations };
}
