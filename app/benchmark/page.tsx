import fs from "node:fs/promises";
import path from "node:path";
import type { BenchmarkResults, ToolScore } from "@/lib/benchmark";

export const dynamic = "force-dynamic";

const TOOLS = [
  { key: "slither", label: "Slither alone", color: "#a47864" },
  { key: "auditlens", label: "AuditLens", color: "#c4b5ec" },
] as const;

const pct = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);

async function load(): Promise<BenchmarkResults | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), "benchmark", "results.json"), "utf8"));
  } catch {
    return null;
  }
}

export default async function BenchmarkPage() {
  const r = await load();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-mocha-50">Benchmark</h1>
        <p className="mt-1 max-w-2xl text-sm text-mocha-400">
          Precision and recall on a labelled set of vulnerable contracts (<code className="text-lavender-300">benchmark/cases</code>), comparing
          Slither alone with the full AuditLens pipeline. Includes a clean control contract, so false positives count.
        </p>
      </div>

      {!r ? (
        <div className="space-y-2 rounded-xl border border-mocha-800 p-6 text-sm text-mocha-400">
          <p className="text-mocha-200">No benchmark results yet.</p>
          <p>
            Run <code className="rounded bg-mocha-900 px-1.5 py-0.5 text-lavender-300">npm run benchmark</code> with Slither installed and an LLM
            configured. It writes <code className="text-lavender-300">benchmark/results.json</code>, which this page shows.
          </p>
        </div>
      ) : (
        <>
          <section className="space-y-4 rounded-xl border border-mocha-800 p-5">
            <div className="flex flex-wrap items-center gap-4 text-xs text-mocha-400">
              <span>
                {r.totals.labels} known bugs · {r.cases.length} cases · {r.analyzer} · model: {r.model} · mode: {r.mode}
              </span>
              <span className="ml-auto flex gap-4">
                {TOOLS.map((t) => (
                  <span key={t.key} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </span>
                ))}
              </span>
            </div>
            {(["precision", "recall"] as const).map((m) => (
              <div key={m}>
                <h2 className="mb-2 text-sm font-medium capitalize text-mocha-200">{m}</h2>
                <div className="space-y-1.5">
                  {TOOLS.map((t) => {
                    const s: ToolScore = r.totals[t.key];
                    const v = s[m];
                    return (
                      <div key={t.key} className="flex items-center gap-3" title={`${t.label}: ${s.tp} TP, ${s.fp} FP, ${s.fn} FN`}>
                        <span className="w-28 shrink-0 text-xs text-mocha-400">{t.label}</span>
                        <div className="h-5 flex-1 rounded bg-mocha-900">
                          <div className="h-5 rounded-r" style={{ width: `${(v ?? 0) * 100}%`, backgroundColor: t.color }} />
                        </div>
                        <span className="w-12 text-right text-sm tabular-nums text-mocha-100">{pct(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-xs text-mocha-500">{r.rule}</p>
          </section>

          <div className="overflow-x-auto rounded-xl border border-mocha-800">
            <table className="w-full text-sm">
              <thead className="bg-mocha-900/60 text-left text-xs uppercase tracking-wide text-mocha-500">
                <tr>
                  <th className="px-3 py-2">Case</th>
                  <th className="px-3 py-2 text-right">Bugs</th>
                  <th className="px-3 py-2 text-right">Slither TP / FP</th>
                  <th className="px-3 py-2 text-right">AuditLens TP / FP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mocha-800">
                {r.cases.map((c) => (
                  <tr key={c.case}>
                    <td className="px-3 py-2 font-mono text-mocha-200">{c.case}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.labels}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.slither.tp} / {c.slither.fp}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {c.auditlens.tp} / {c.auditlens.fp}
                    </td>
                  </tr>
                ))}
                <tr className="bg-mocha-900/40 font-medium">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.totals.labels}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.totals.slither.tp} / {r.totals.slither.fp}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.totals.auditlens.tp} / {r.totals.auditlens.fp}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-mocha-600">
            Generated {new Date(r.generated_at).toLocaleString()} from a single run. The LLM is not deterministic, so AuditLens numbers can
            move a little between runs; Slither&apos;s don&apos;t.
          </p>
        </>
      )}
    </div>
  );
}
