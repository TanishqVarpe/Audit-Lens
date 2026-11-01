import { notFound } from "next/navigation";
import { ComparisonBanner } from "@/components/ComparisonBanner";
import { ReportClient } from "@/components/ReportClient";
import { ReportHeader } from "@/components/ReportHeader";
import { RiskGrade } from "@/components/RiskGrade";
import { SummaryBar } from "@/components/SummaryBar";
import { compareReports } from "@/lib/compare";
import { buildContractMap } from "@/lib/contractmap";
import { llmConfig } from "@/lib/gemma";
import { riskScore } from "@/lib/score";
import { loadReport } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) notFound();

  // Recompute the re-audit comparison so it always uses the current matching rules.
  const parent = report.parent_id ? await loadReport(report.parent_id) : null;
  if (parent) report.comparison = compareReports(parent, report);

  const sources = report.sources ?? [];
  const map = buildContractMap(
    sources.filter((f) => f.path.endsWith(report.chain === "soroban" ? ".rs" : ".sol")),
    report.findings,
    report.chain,
  );

  const aside = (
    <>
      <RiskGrade risk={riskScore(report.summary)} reportId={report.report_id} />
      <SummaryBar report={report} />
      {(report.warnings.length > 0 || report.focus) && (
        <section className="glass space-y-2 rounded-3xl p-5 text-sm">
          <h2 className="text-xs uppercase tracking-widest text-mocha-500">Notes</h2>
          {report.focus && (
            <p className="rounded-xl border border-sky-400/30 bg-sky-400/5 p-3 text-sky-100">
              Diff mode: only {report.focus.length} changed function(s) were audited ({report.focus.map((f) => f.name).join(", ")}).
            </p>
          )}
          {report.warnings.map((w) => (
            <p key={w} className="flex gap-2 rounded-xl border border-amber-400/25 bg-amber-400/5 p-3 leading-relaxed text-amber-100/90">
              <span aria-hidden>⚠</span>
              <span>{w}</span>
            </p>
          ))}
        </section>
      )}
      <p className="px-2 text-xs leading-relaxed text-mocha-500">Automated first-pass review. Not a substitute for a professional audit.</p>
    </>
  );

  return (
    <div className="space-y-6">
      <ReportHeader report={report} />
      {report.comparison && <ComparisonBanner c={report.comparison} />}

      <ReportClient
        reportId={report.report_id}
        chain={report.chain}
        initialFindings={report.findings}
        initialWorking={Object.keys(report.working ?? {})}
        map={map}
        hasSources={sources.length > 0}
        hasLlm={llmConfig() !== null}
        aside={aside}
      >
        {report.dropped_findings.length > 0 && (
          <details className="glass rounded-2xl p-4 text-sm">
            <summary className="cursor-pointer text-mocha-200">
              {report.dropped_findings.length} AI claim(s) removed because they could not be verified
            </summary>
            <ul className="mt-3 space-y-1 text-mocha-400">
              {report.dropped_findings.map((d, i) => (
                <li key={i}>
                  <span className="text-mocha-200">{d.title}</span>: {d.reason}
                </li>
              ))}
            </ul>
          </details>
        )}
      </ReportClient>
    </div>
  );
}
