import type { Report, Severity } from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/types";

/** Severity colors as hex for the stacked bar (matches SeverityBadge). */
export const SEVERITY_HEX: Record<Severity, string> = {
  critical: "#f87171",
  high: "#fb923c",
  medium: "#fbbf24",
  low: "#38bdf8",
  info: "#a39b94",
  optimization: "#34d399",
};

/** Severity breakdown: one stacked bar, then a row per severity, then where findings came from. */
export function SummaryBar({ report }: { report: Report }) {
  const total = SEVERITY_ORDER.reduce((n, s) => n + report.summary[s], 0);
  const stats: [number, string][] = [
    [report.counts.tool_confirmed, "tool-confirmed"],
    [report.counts.ai_suggested, "AI-suggested"],
    [report.counts.false_positives, "false positives filtered"],
    [report.dropped_findings.length, "unverifiable AI claims removed"],
  ];

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-widest text-mocha-500">Findings</h2>
        <span className="text-2xl font-semibold text-mocha-50">{total}</span>
      </div>

      <div className="mt-3 flex h-2.5 origin-left animate-grow-x gap-0.5 overflow-hidden rounded-full bg-mocha-800">
        {SEVERITY_ORDER.filter((s) => report.summary[s]).map((s) => (
          <div key={s} title={`${report.summary[s]} ${s}`} style={{ flexGrow: report.summary[s], background: SEVERITY_HEX[s] }} />
        ))}
      </div>

      <ul className="mt-4 space-y-1.5">
        {SEVERITY_ORDER.map((s) => {
          const n = report.summary[s];
          return (
            <li key={s} className={`flex items-center gap-3 text-sm ${n ? "text-mocha-100" : "text-mocha-600"}`}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: n ? SEVERITY_HEX[s] : "#4f3f36" }} />
              <span className="flex-1 capitalize">{s}</span>
              <span className="tabular-nums font-medium">{n}</span>
            </li>
          );
        })}
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-mocha-700/60 pt-4">
        {stats.map(([n, label]) => (
          <div key={label} className="rounded-xl bg-mocha-950/50 px-3 py-2">
            <dt className="text-lg font-semibold text-mocha-50">{n}</dt>
            <dd className="text-[11px] leading-tight text-mocha-400">{label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
