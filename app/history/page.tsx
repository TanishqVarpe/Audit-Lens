import Link from "next/link";
import { TrendChart } from "@/components/TrendChart";
import { GRADE_COLOR, type Grade } from "@/lib/score";
import { listReports } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const all = await listReports();
  const rows = project ? all.filter((r) => r.project_name === project) : all;
  const projects = [...new Set(all.map((r) => r.project_name))];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-mocha-50">Audit history</h1>
        <p className="mt-1 text-sm text-mocha-500">
          {all.length} report(s) across {projects.length} project(s). Indexed in SQLite; the JSON reports stay the source of truth.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/history"
          className={`rounded-full px-3 py-1 text-sm ring-1 ${!project ? "bg-mocha-100 text-mocha-900 ring-mocha-100" : "text-mocha-400 ring-mocha-700 hover:text-mocha-200"}`}
        >
          All projects
        </Link>
        {projects.map((p) => (
          <Link
            key={p}
            href={`/history?project=${encodeURIComponent(p)}`}
            className={`rounded-full px-3 py-1 text-sm ring-1 ${project === p ? "bg-mocha-100 text-mocha-900 ring-mocha-100" : "text-mocha-400 ring-mocha-700 hover:text-mocha-200"}`}
          >
            {p}
          </Link>
        ))}
      </div>

      {project && (
        <section className="rounded-xl border border-mocha-800 p-4">
          <h2 className="mb-3 text-sm font-medium text-mocha-300">Risk score trend · {project}</h2>
          <TrendChart
            points={rows.map((r) => ({ id: r.report_id, date: r.created_at, score: r.score, grade: r.grade, findings: r.findings }))}
          />
        </section>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-mocha-800 p-6 text-sm text-mocha-500">
          No audits yet. <Link href="/" className="text-lavender-300">Run one</Link>.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-mocha-800">
          <table className="w-full text-sm">
            <thead className="bg-mocha-900/60 text-left text-xs uppercase tracking-wide text-mocha-500">
              <tr>
                <th className="px-3 py-2">Grade</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2 text-right">Crit</th>
                <th className="px-3 py-2 text-right">High</th>
                <th className="px-3 py-2 text-right">Med</th>
                <th className="px-3 py-2 text-right">Low</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-mocha-800">
              {rows.map((r) => (
                <tr key={r.report_id} className="hover:bg-mocha-900/40">
                  <td className="px-3 py-2">
                    <span
                      className="grid h-6 w-6 place-items-center rounded text-xs font-bold text-mocha-950"
                      style={{ backgroundColor: GRADE_COLOR[r.grade as Grade] }}
                    >
                      {r.grade}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-mocha-200">
                    {r.project_name}
                    {r.parent_id && <span className="ml-2 text-xs text-sky-400">re-audit</span>}
                  </td>
                  <td className="px-3 py-2 text-mocha-400">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.summary.critical}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.summary.high}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.summary.medium}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.summary.low}</td>
                  <td className="px-3 py-2 text-xs text-mocha-500">
                    {r.chain} · {r.mode}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link href={`/report/${r.report_id}`} className="text-lavender-300 hover:text-lavender-200">
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
