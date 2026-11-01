"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MapContract } from "@/lib/contractmap";
import type { Chain, Finding } from "@/lib/types";
import { AskBox } from "./AskBox";
import { CodeViewerProvider } from "./CodeViewer";
import { ContractMap } from "./ContractMap";
import { FindingList } from "./FindingList";

type Tab = "findings" | "map" | "ask";

export function ReportClient({
  reportId,
  chain,
  initialFindings,
  initialWorking,
  map,
  hasSources,
  hasLlm,
  aside,
  children,
}: {
  reportId: string;
  chain: Chain;
  initialFindings: Finding[];
  initialWorking: string[];
  map: MapContract[];
  hasSources: boolean;
  hasLlm: boolean;
  /** Server-rendered sidebar (grade, breakdown, warnings). */
  aside: React.ReactNode;
  /** Extra content under the panels. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("findings");
  const [findings, setFindings] = useState(initialFindings);
  const [working, setWorking] = useState(initialWorking);
  const [reauditing, setReauditing] = useState(false);
  const [error, setError] = useState("");

  async function reaudit() {
    setReauditing(true);
    setError("");
    try {
      const res = await fetch(`/api/report/${reportId}/reaudit`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Re-audit failed.");
      router.push(`/report/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-audit failed.");
      setReauditing(false);
    }
  }

  const applied = findings.filter((f) => f.fix?.applied).length;
  const tabs: [Tab, string][] = [
    ["findings", `Findings (${findings.filter((f) => f.status !== "false_positive").length})`],
    ["map", "Contract map"],
    ["ask", "Ask about the code"],
  ];

  return (
    <CodeViewerProvider reportId={reportId} findings={findings}>
      <div className="grid items-start gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-2 lg:[scrollbar-width:thin] lg:[scrollbar-color:#4f3f36_transparent]">
          {aside}
          {hasSources && (
            <section
              className={`glass rounded-3xl p-5 transition ${working.length ? "border-lavender-400/50 shadow-[0_0_40px_-12px_rgba(196,181,236,0.5)]" : ""}`}
            >
              <h2 className="text-xs uppercase tracking-widest text-mocha-500">Fix & re-audit</h2>
              <p className="mt-2 text-sm leading-relaxed text-mocha-200">
                {working.length
                  ? `${applied} fix(es) applied to ${working.length} file(s). Re-audit to see what changed.`
                  : "Use “Fix it” on a finding, apply the patch, then re-audit to compare."}
              </p>
              <button
                onClick={reaudit}
                disabled={reauditing}
                className={`mt-4 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 ${
                  working.length
                    ? "bg-lavender-300 text-mocha-950 shadow-[0_10px_30px_-10px_rgba(196,181,236,0.8)] hover:bg-lavender-200"
                    : "border border-mocha-600 bg-mocha-900/60 text-mocha-100 hover:border-lavender-400/60"
                }`}
              >
                {reauditing ? "Re-auditing…" : working.length ? "Re-audit with fixes" : "Re-audit"}
              </button>
              {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
            </section>
          )}
        </aside>

        <div className="min-w-0 space-y-5">
          <div role="tablist" className="glass inline-flex flex-wrap gap-1 rounded-2xl p-1">
            {tabs.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-xl px-4 py-2 text-sm transition ${
                  tab === id
                    ? "bg-lavender-300 font-medium text-mocha-950 shadow-[0_6px_20px_-8px_rgba(196,181,236,0.9)]"
                    : "text-mocha-300 hover:bg-mocha-800/70 hover:text-mocha-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Panels stay mounted (hidden) so chat history and map layout survive tab switches. */}
          <div hidden={tab !== "findings"}>
            <FindingList
              findings={findings}
              actions={{
                reportId,
                chain,
                canGenerate: hasSources && hasLlm,
                onUpdate: (f, w) => {
                  setFindings(f);
                  setWorking(w);
                },
              }}
            />
          </div>
          <div hidden={tab !== "map"}>
            {hasSources ? (
              <ContractMap contracts={map} />
            ) : (
              <p className="glass rounded-2xl p-6 text-sm text-mocha-400">This report was saved without source code. Re-run the audit to see the map.</p>
            )}
          </div>
          <div hidden={tab !== "ask"}>
            <AskBox reportId={reportId} enabled={hasSources && hasLlm} />
          </div>
          {children}
        </div>
      </div>
    </CodeViewerProvider>
  );
}
