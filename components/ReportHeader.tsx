import Link from "next/link";
import type { Report } from "@/lib/types";

const MODE: Record<Report["mode"], [string, string]> = {
  full: ["Full review", "border-emerald-400/40 text-emerald-200 bg-emerald-400/10"],
  "ai-only": ["AI-only review", "border-lavender-400/40 text-lavender-200 bg-lavender-400/10"],
  "tool-only": ["Tool-only review", "border-sky-400/40 text-sky-200 bg-sky-400/10"],
};

export function ReportHeader({ report }: { report: Report }) {
  const [modeLabel, modeStyle] = MODE[report.mode];
  const chips = [
    `${report.files_analyzed} file(s)`,
    report.chain === "soroban" ? "Soroban" : "Solidity",
    report.analyzer === "none" ? "no analyzer" : report.analyzer,
    report.model,
    `${(report.duration_ms / 1000).toFixed(1)}s`,
    new Date(report.created_at).toLocaleString(),
  ];

  return (
    <header className="glass animate-fade-up relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div aria-hidden className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-lavender-400/15 blur-3xl" />
      <div aria-hidden className="absolute -bottom-32 left-1/3 h-56 w-96 rounded-full bg-[#a47864]/15 blur-3xl" />

      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 space-y-3">
          <Link href="/" className="text-sm text-mocha-400 transition hover:text-lavender-200">
            ← New audit
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-platinum-sheen animate-shimmer text-3xl font-semibold tracking-tight sm:text-4xl">{report.project_name}</h1>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${modeStyle}`}>{modeLabel}</span>
            {report.local_llm && (
              <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-0.5 text-xs text-emerald-200">
                Local · code never left this machine
              </span>
            )}
          </div>
          <ul className="flex flex-wrap gap-2 text-xs text-mocha-300">
            {chips.map((c) => (
              <li key={c} className="rounded-md border border-mocha-700/70 bg-mocha-950/50 px-2 py-1 font-mono">
                {c}
              </li>
            ))}
          </ul>
          {report.origin && <p className="font-mono text-xs text-mocha-500">{report.origin}</p>}
        </div>

        <div className="flex gap-2">
          <Link
            href={`/history?project=${encodeURIComponent(report.project_name)}`}
            className="rounded-xl border border-mocha-600/70 bg-mocha-900/60 px-4 py-2 text-sm text-mocha-100 transition hover:-translate-y-0.5 hover:border-lavender-400/60"
          >
            History
          </Link>
          <a
            href={`/api/report/${report.report_id}?format=md`}
            className="rounded-xl bg-lavender-300 px-4 py-2 text-sm font-semibold text-mocha-950 shadow-[0_8px_30px_-10px_rgba(196,181,236,0.8)] transition hover:-translate-y-0.5 hover:bg-lavender-200"
          >
            Export Markdown
          </a>
        </div>
      </div>
    </header>
  );
}
