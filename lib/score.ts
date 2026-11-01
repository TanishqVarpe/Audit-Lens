import type { Severity } from "./types";

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface RiskScore {
  score: number; // 0-100, higher is safer
  grade: Grade;
  reason: string;
}

const PENALTY: Record<Severity, number> = { critical: 40, high: 20, medium: 7, low: 2, info: 0.5, optimization: 0 };

/**
 * One grade from the severity counts (false positives already excluded).
 * Caps keep the grade honest: any critical is an F, any high is at best a D.
 */
export function riskScore(summary: Record<Severity, number>): RiskScore {
  const penalty = (Object.keys(PENALTY) as Severity[]).reduce((n, s) => n + PENALTY[s] * (summary[s] ?? 0), 0);
  const score = Math.max(0, Math.round(100 - penalty));
  let grade: Grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  let reason = `score ${score}/100`;
  if (summary.critical > 0) {
    grade = "F";
    reason = `${summary.critical} critical issue(s)`;
  } else if (summary.high > 0 && grade < "D") {
    grade = "D";
    reason = `${summary.high} high issue(s) cap the grade at D`;
  }
  return { score, grade, reason };
}

export const GRADE_COLOR: Record<Grade, string> = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#eab308",
  D: "#f97316",
  F: "#ef4444",
};

/** Shields-style SVG badge for READMEs. */
export function badgeSvg(grade: Grade, score: number): string {
  const label = "AuditLens";
  const value = `${grade} · ${score}`;
  const lw = 66;
  const vw = 8 + value.length * 7;
  const w = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}">
<title>${label}: ${value}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#3a2d26"/><rect x="${lw}" width="${vw}" height="20" fill="${GRADE_COLOR[grade]}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${label}</text><text x="${lw + vw / 2}" y="14">${value}</text></g>
</svg>`;
}
