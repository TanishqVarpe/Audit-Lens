export type Severity = "critical" | "high" | "medium" | "low" | "info" | "optimization";

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info", "optimization"];

export type Chain = "solidity" | "soroban";

export interface SourceFile {
  path: string; // relative to project root, forward slashes
  content: string;
}

/** A raw finding from the static analyzer (ground truth). */
export interface AnalyzerFinding {
  id: string; // S-001
  check: string; // e.g. reentrancy-eth
  severity: Severity;
  confidence: string;
  description: string;
  file: string;
  lines: number[];
}

/** A Gemma-generated patch for one finding. `compiles` is set by code, never by the LLM. */
export interface FixResult {
  file: string;
  patched: string; // full patched file
  diff: string; // unified diff
  compiles: boolean | null; // null = compile check unavailable
  compiler: string;
  compile_note?: string;
  summary: string;
  applied: boolean;
  /** Fixes already applied to this file when the patch was generated (they're included in it). */
  base_fixes?: string[];
  created_at: string;
}

/** A Gemma-written Foundry test. `status` comes from actually running forge, never from the LLM. */
export interface ExploitResult {
  test: string;
  status: "confirmed" | "not_confirmed" | "not_run" | "error";
  output?: string;
  note?: string;
  /** Result of re-running the same test against the applied fix. */
  after_fix?: "blocked" | "still_exploitable";
  created_at: string;
}

export interface Finding {
  id: string;
  title: string;
  file_name: string;
  line: number;
  code_quote: string;
  vulnerability_type: string;
  severity: Severity;
  source: "slither" | "scout" | "ai";
  slither_check?: string;
  /** Other tool checks the model merged into this finding (verified IDs only). */
  merged_checks?: string[];
  status: "confirmed" | "false_positive" | "needs_review";
  explanation: string;
  suggested_fix: string;
  /** Beginner-friendly explanation for the "Explain like I'm new" toggle. */
  simple_explanation?: string;
  /** Checked against lib/swc.ts; unknown IDs are discarded. */
  swc_id?: string;
  /** Step-by-step attack story, high and critical only. */
  attack_scenario?: string[];
  /** Set by code in lib/verify.ts, never by the LLM. */
  verified: boolean;
  verification_note?: string;
  fix?: FixResult;
  exploit?: ExploitResult;
}

export interface FocusRange {
  file: string;
  name: string;
  start: number;
  end: number;
}

export interface Comparison {
  parent_id: string;
  before: Record<Severity, number>;
  after: Record<Severity, number>;
  grade_before: string;
  grade_after: string;
  fixed: { title: string; severity: Severity; file_name: string }[];
  added: { title: string; severity: Severity; file_name: string }[];
}

export interface Report {
  report_id: string;
  project_name: string;
  chain: Chain;
  analyzer: string;
  model: string;
  mode: "full" | "ai-only" | "tool-only";
  /** True when the LLM ran locally (Ollama), so no code left the machine. */
  local_llm?: boolean;
  files_analyzed: number;
  files_excluded: string[];
  files_truncated: string[];
  summary: Record<Severity, number>;
  counts: { tool_confirmed: number; ai_suggested: number; false_positives: number };
  dropped_findings: { title: string; reason: string }[];
  warnings: string[];
  findings: Finding[];
  duration_ms: number;
  created_at: string;
  /** Full source of every audited file (code view, fixes, Q&A, re-audit). */
  sources?: SourceFile[];
  /** Files with applied fixes, overlaid on `sources` for a re-audit. */
  working?: Record<string, string>;
  /** Diff mode: only these functions were audited. */
  focus?: FocusRange[];
  /** Where the code came from, e.g. "eth:0xabc…" for a deployed contract. */
  origin?: string;
  parent_id?: string;
  comparison?: Comparison;
}
