import type { Severity } from "./types";

/** A known bug. `line` and `range` are resolved from `match` at run time. */
export interface Label {
  case: string;
  file: string;
  match: string;
  category: string;
  line?: number;
  range?: [number, number]; // enclosing function
}

/** A prediction from either tool, reduced to what scoring needs. */
export interface Prediction {
  file: string;
  line: number;
  text: string; // check + type + title, for category matching
  severity: Severity;
}

export interface ToolScore {
  tp: number;
  fp: number;
  fn: number;
  predictions: number;
  precision: number | null;
  recall: number | null;
}

export interface CaseResult {
  case: string;
  labels: number;
  slither: ToolScore & { found: string[] };
  auditlens: ToolScore & { found: string[] };
}

export interface BenchmarkResults {
  generated_at: string;
  analyzer: string;
  model: string;
  mode: string;
  rule: string;
  cases: CaseResult[];
  totals: { labels: number; slither: ToolScore; auditlens: ToolScore };
}

/** Category → words that identify it in a detector name, type or title. */
const ALIASES: Record<string, RegExp> = {
  reentrancy: /reentran/i,
  "tx-origin": /tx[.\s-]?origin/i,
  "access-control": /access|unprotected|authori[sz]|owner|missing.*(check|modifier)|arbitrary/i,
  selfdestruct: /selfdestruct|suicid/i,
  "unchecked-call": /unchecked|return value|unused-return|low.?level|send/i,
  delegatecall: /delegatecall/i,
  "weak-randomness": /random|prng|timestamp|predictab/i,
  overflow: /overflow|underflow|arithmetic|unchecked/i,
  dos: /dos|denial|loop|unbounded|gas/i,
};

const LINE_TOLERANCE = 2;
export const MIN_SEVERITY: Severity[] = ["critical", "high", "medium", "low"];

/**
 * Score one tool on one case. A prediction is a true positive if it is in the same
 * file, on the bug line (±2) or inside the same function, and names the bug's category.
 * Several predictions of one bug count once (duplicates are not penalised).
 */
export function score(labels: Label[], preds: Prediction[]): ToolScore & { found: string[] } {
  const relevant = preds.filter((p) => MIN_SEVERITY.includes(p.severity));
  const hitLabels = new Set<Label>();
  let fp = 0;
  for (const p of relevant) {
    const match = labels.find(
      (l) =>
        l.file === p.file &&
        ALIASES[l.category]?.test(p.text) &&
        ((l.line && Math.abs(p.line - l.line) <= LINE_TOLERANCE) || (l.range && p.line >= l.range[0] && p.line <= l.range[1])),
    );
    if (match) hitLabels.add(match);
    else fp++;
  }
  const tp = hitLabels.size;
  return {
    tp,
    fp,
    fn: labels.length - tp,
    predictions: relevant.length,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: labels.length ? tp / labels.length : null,
    found: [...hitLabels].map((l) => l.category),
  };
}

export function sum(scores: ToolScore[], labels: number): ToolScore {
  const tp = scores.reduce((n, s) => n + s.tp, 0);
  const fp = scores.reduce((n, s) => n + s.fp, 0);
  const predictions = scores.reduce((n, s) => n + s.predictions, 0);
  return {
    tp,
    fp,
    fn: labels - tp,
    predictions,
    precision: tp + fp ? tp / (tp + fp) : null,
    recall: labels ? tp / labels : null,
  };
}
