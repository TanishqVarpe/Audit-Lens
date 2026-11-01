"use client";

import { useMemo, useState } from "react";
import { SWC, swcUrl } from "@/lib/swc";
import type { Chain, Finding } from "@/lib/types";
import { SEVERITY_ORDER } from "@/lib/types";
import { CodeBlock, useCodeViewer } from "./CodeViewer";
import { SeverityBadge } from "./SeverityBadge";
import { SEVERITY_HEX } from "./SummaryBar";

type Filter = "all" | "tool" | "ai" | "false_positive";

export interface FindingActions {
  reportId: string;
  chain: Chain;
  canGenerate: boolean; // LLM configured and source stored
  onUpdate: (findings: Finding[], working: string[]) => void;
}

export function FindingList({ findings, actions }: { findings: Finding[]; actions: FindingActions }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [eli5, setEli5] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set(findings.slice(0, 1).map((f) => f.id)));

  const shown = useMemo(
    () =>
      findings.filter((f) =>
        filter === "false_positive"
          ? f.status === "false_positive"
          : f.status !== "false_positive" && (filter === "all" || (filter === "ai" ? f.source === "ai" : f.source !== "ai")),
      ),
    [findings, filter],
  );

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const filters: [Filter, string][] = [
    ["all", "All"],
    ["tool", "Tool-confirmed"],
    ["ai", "AI-suggested"],
    ["false_positive", "False positives"],
  ];

  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5">
        {filters.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1 text-sm transition ${
              filter === id
                ? "bg-mocha-100 font-medium text-mocha-950"
                : "text-mocha-300 ring-1 ring-mocha-700 hover:text-mocha-50 hover:ring-mocha-500"
            }`}
          >
            {label}
          </button>
        ))}
        <label className="ml-1 flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 text-sm text-mocha-200 transition hover:bg-mocha-800/60">
          <span
            role="switch"
            aria-checked={eli5}
            tabIndex={0}
            onClick={() => setEli5(!eli5)}
            onKeyDown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), setEli5(!eli5))}
            className={`relative h-5 w-9 rounded-full transition ${eli5 ? "bg-lavender-400" : "bg-mocha-700"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${eli5 ? "left-[18px]" : "left-0.5"}`} />
          </span>
          Explain like I&apos;m new
        </label>
        <span className="ml-auto flex gap-3 text-xs text-mocha-500">
          <button onClick={() => setOpen(new Set(shown.map((f) => f.id)))} className="hover:text-mocha-300">
            Expand all
          </button>
          <button onClick={() => setOpen(new Set())} className="hover:text-mocha-300">
            Collapse all
          </button>
        </span>
      </div>

      {shown.length === 0 && <p className="glass rounded-2xl p-8 text-center text-sm text-mocha-400">No findings in this view.</p>}

      {SEVERITY_ORDER.map((sev) => {
        const group = shown.filter((f) => f.severity === sev);
        if (!group.length) return null;
        return (
          <section key={sev} className="space-y-3">
            <h3 className="flex items-center gap-3 pt-2 text-xs font-medium uppercase tracking-[0.2em] text-mocha-400">
              <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_HEX[sev], boxShadow: `0 0 10px ${SEVERITY_HEX[sev]}` }} />
              {sev}
              <span className="rounded-full bg-mocha-800 px-2 py-0.5 text-[10px] tracking-normal text-mocha-200">{group.length}</span>
              <span className="h-px flex-1 bg-gradient-to-r from-mocha-700 to-transparent" />
            </h3>
            {group.map((f, i) => (
              <div key={f.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
                <FindingCard f={f} eli5={eli5} open={open.has(f.id)} onToggle={() => toggle(f.id)} actions={actions} />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function FindingCard({
  f,
  eli5,
  open,
  onToggle,
  actions,
}: {
  f: Finding;
  eli5: boolean;
  open: boolean;
  onToggle: () => void;
  actions: FindingActions;
}) {
  const view = useCodeViewer();
  const [busy, setBusy] = useState<"" | "fix" | "apply" | "unapply" | "exploit">("");
  const [error, setError] = useState("");
  const lang = actions.chain === "soroban" ? "rust" : "solidity";
  const swc = f.swc_id ? SWC[f.swc_id] : undefined;
  const simple = f.simple_explanation || swc?.simple;

  async function act(action: "fix" | "apply" | "unapply" | "exploit") {
    setBusy(action);
    setError("");
    try {
      const res = await fetch(`/api/report/${actions.reportId}/finding`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, finding_id: f.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");
      actions.onUpdate(data.findings, data.working);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }

  const openCode = () => view({ path: f.file_name, line: f.line, title: f.title });

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-mocha-900/55 backdrop-blur transition duration-300 ${
        open
          ? "border-mocha-600/80 shadow-[0_24px_60px_-30px_rgba(196,181,236,0.45)]"
          : "border-mocha-700/60 hover:-translate-y-0.5 hover:border-mocha-500/70 hover:shadow-[0_16px_40px_-24px_rgba(0,0,0,0.8)]"
      }`}
    >
      {/* Severity edge */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: SEVERITY_HEX[f.severity] }} />
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 py-4 pl-6 pr-5 text-left">
        <SeverityBadge severity={f.severity} />
        <span className="flex-1 text-[15px] font-medium text-mocha-50">{f.title}</span>
        {f.exploit?.status === "confirmed" && (
          <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300 ring-1 ring-red-500/40">Exploit confirmed</span>
        )}
        {f.fix?.applied && <span className="rounded bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300 ring-1 ring-sky-500/30">Fix applied</span>}
        <SourceBadge f={f} />
        <span className="hidden rounded-md bg-mocha-950/60 px-2 py-0.5 font-mono text-xs text-mocha-400 md:inline">
          {f.file_name}:{f.line}
        </span>
        <span
          className={`grid h-6 w-6 place-items-center rounded-full transition duration-300 ${
            open ? "rotate-90 bg-lavender-300/20 text-lavender-200" : "bg-mocha-800/80 text-mocha-300"
          }`}
        >
          ›
        </span>
      </button>

      {open && (
        <div className="space-y-5 border-t border-mocha-700/60 py-5 pl-6 pr-5 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-xs text-mocha-400 [&>*]:rounded-md [&>*]:bg-mocha-950/50 [&>*]:px-2 [&>*]:py-1">
            <span className="font-mono">{f.id}</span>
            <button onClick={openCode} className="font-mono text-lavender-300/90 underline decoration-dotted underline-offset-2 hover:text-lavender-200">
              {f.file_name}:{f.line}
            </button>
            <span>Type: {f.vulnerability_type}</span>
            {f.swc_id && (
              <a href={swcUrl(f.swc_id)} target="_blank" rel="noreferrer" className="text-sky-400 hover:text-sky-300">
                {f.swc_id} ↗
              </a>
            )}
            {f.slither_check && <span>{f.source === "scout" ? "Scout" : "Slither"}: {f.slither_check}</span>}
            <span>Status: {f.status.replace("_", " ")}</span>
          </div>

          {f.code_quote && (
            <button
              onClick={openCode}
              title="Open the whole file"
              className="group block w-full overflow-x-auto rounded-xl bg-mocha-950/80 px-4 py-3 text-left font-mono text-xs text-lavender-100 ring-1 ring-mocha-700/70 transition hover:ring-lavender-400/60"
            >
              <span className="select-none text-mocha-600">{String(f.line).padStart(4)} │ </span>
              {f.code_quote}
              <span className="float-right select-none pl-4 font-sans text-mocha-600 group-hover:text-lavender-300">View in file →</span>
            </button>
          )}

          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-mocha-500">{eli5 ? "In plain words" : "Explanation"}</h4>
            {eli5 ? (
              <div className="rounded-xl border border-lavender-400/25 bg-lavender-400/[0.07] p-4 leading-relaxed text-mocha-100">
                <p>{simple ?? "No beginner explanation is available for this finding yet. The technical explanation is below."}</p>
                {!simple && <p className="mt-2 text-mocha-400">{f.explanation}</p>}
                {swc && (
                  <a href={swcUrl(f.swc_id!)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-sky-400 hover:text-sky-300">
                    Learn more: {f.swc_id} {swc.title} ↗
                  </a>
                )}
              </div>
            ) : (
              <p className="leading-relaxed text-mocha-300">{f.explanation}</p>
            )}
          </div>

          {f.attack_scenario?.length ? (
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-mocha-500">Attack scenario</h4>
              <ol className="relative space-y-2.5 pl-1">
                <span aria-hidden className="absolute bottom-2 left-[15px] top-2 w-px bg-gradient-to-b from-red-400/60 to-red-400/0" />
                {f.attack_scenario.map((s, i) => (
                  <li key={i} className="relative flex gap-3 text-mocha-200">
                    <span className="z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-mocha-900 font-mono text-[11px] text-red-300 ring-1 ring-red-400/40">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {f.suggested_fix.trim() && (
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-mocha-500">Suggested fix</h4>
              <p className="whitespace-pre-wrap leading-relaxed text-mocha-300">{f.suggested_fix}</p>
            </div>
          )}

          {f.status !== "false_positive" && (
            <div className="flex flex-wrap items-center gap-2 border-t border-mocha-700/40 pt-4">
              <ActionButton
                variant="primary"
                onClick={() => act("fix")}
                busy={busy === "fix"}
                disabled={!!busy || !actions.canGenerate}
                label={f.fix ? "Regenerate fix" : "Fix it"}
                busyLabel="Gemma is writing a patch…"
              />
              {lang === "solidity" && (
                <ActionButton
                  onClick={() => act("exploit")}
                  busy={busy === "exploit"}
                  disabled={!!busy || !actions.canGenerate}
                  label={f.exploit ? "Re-run exploit test" : "Prove it (exploit test)"}
                  busyLabel="Writing and running a Foundry test…"
                />
              )}
              {!actions.canGenerate && <span className="text-xs text-mocha-600">Needs an LLM and a report with stored source.</span>}
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}

          {f.fix && <FixPanel f={f} lang={lang} busy={busy} onAct={act} />}
          {f.exploit && <ExploitPanel f={f} />}

          <p className={`text-xs ${f.verified ? "text-emerald-400" : "text-amber-400"}`}>
            {f.verified ? "✓ Verified against source" : "⚠ Not verified"}
            {f.verification_note && <span className="text-mocha-500"> · {f.verification_note}</span>}
          </p>
        </div>
      )}
    </article>
  );
}

function FixPanel({
  f,
  lang,
  busy,
  onAct,
}: {
  f: Finding;
  lang: "solidity" | "rust";
  busy: string;
  onAct: (a: "apply" | "unapply") => void;
}) {
  const fix = f.fix!;
  return (
    <div className="space-y-3 rounded-2xl border border-mocha-700/60 bg-mocha-950/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-mocha-400">Generated patch</h4>
        {fix.compiles === true && (
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300 ring-1 ring-emerald-500/30">✓ compiles</span>
        )}
        {fix.compiles === false && (
          <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-300 ring-1 ring-red-500/30">✗ does not compile</span>
        )}
        {fix.compiles === null && (
          <span className="rounded bg-mocha-500/10 px-2 py-0.5 text-xs text-mocha-400 ring-1 ring-mocha-600">compile check unavailable</span>
        )}
        <span className="text-xs text-mocha-600">{fix.compiler}</span>
        <span className="ml-auto">
          {fix.applied ? (
            <ActionButton onClick={() => onAct("unapply")} busy={busy === "unapply"} disabled={!!busy} label="Undo apply" busyLabel="…" subtle />
          ) : (
            <ActionButton
              variant="primary"
              onClick={() => onAct("apply")}
              busy={busy === "apply"}
              disabled={!!busy || fix.compiles === false}
              label="Apply fix"
              busyLabel="…"
            />
          )}
        </span>
      </div>
      {fix.summary && <p className="text-mocha-300">{fix.summary}</p>}
      <CodeBlock code={fix.diff.trim()} lang={lang} diff />
      {fix.compile_note && (
        <details className="text-xs text-mocha-500">
          <summary className="cursor-pointer">Compiler notes</summary>
          <pre className="mt-1 whitespace-pre-wrap">{fix.compile_note}</pre>
        </details>
      )}
    </div>
  );
}

const EXPLOIT_STYLE: Record<string, [string, string]> = {
  confirmed: ["Exploit confirmed", "bg-red-500/15 text-red-300 ring-red-500/40"],
  not_confirmed: ["Not confirmed", "bg-mocha-500/10 text-mocha-300 ring-mocha-600"],
  not_run: ["Test written, not run", "bg-mocha-500/10 text-mocha-300 ring-mocha-600"],
  error: ["Test did not compile", "bg-amber-400/10 text-amber-200 ring-amber-400/30"],
};

function ExploitPanel({ f }: { f: Finding }) {
  const ex = f.exploit!;
  const [label, style] = EXPLOIT_STYLE[ex.status];
  return (
    <div className="space-y-3 rounded-2xl border border-mocha-700/60 bg-mocha-950/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-mocha-400">Exploit test</h4>
        <span className={`rounded px-2 py-0.5 text-xs ring-1 ${style}`}>{label}</span>
        {ex.after_fix === "blocked" && (
          <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300 ring-1 ring-emerald-500/30">✓ applied fix blocks it</span>
        )}
        {ex.after_fix === "still_exploitable" && (
          <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-300 ring-1 ring-red-500/30">✗ still exploitable after fix</span>
        )}
      </div>
      {ex.note && <p className="text-mocha-400">{ex.note}</p>}
      <details>
        <summary className="cursor-pointer text-xs text-mocha-500">test/Exploit.t.sol</summary>
        <div className="mt-2">
          <CodeBlock code={ex.test} lang="solidity" />
        </div>
      </details>
      {ex.output && (
        <details>
          <summary className="cursor-pointer text-xs text-mocha-500">forge output</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-mocha-950 p-2 text-xs text-mocha-400">{ex.output}</pre>
        </details>
      )}
    </div>
  );
}

function ActionButton({
  onClick,
  busy,
  disabled,
  label,
  busyLabel,
  subtle,
  variant,
}: {
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  label: string;
  busyLabel: string;
  subtle?: boolean;
  variant?: "primary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-4 py-2 text-xs font-semibold transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 ${
        variant === "primary"
          ? "bg-lavender-300 text-mocha-950 shadow-[0_8px_24px_-10px_rgba(196,181,236,0.9)] hover:bg-lavender-200"
          : subtle
            ? "text-mocha-300 ring-1 ring-mocha-700 hover:ring-mocha-500"
            : "border border-mocha-600 bg-mocha-900/70 text-mocha-100 hover:border-lavender-400/60"
      }`}
    >
      {busy ? busyLabel : label}
    </button>
  );
}

function SourceBadge({ f }: { f: Finding }) {
  return f.source !== "ai" ? (
    <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300 ring-1 ring-emerald-500/30">Tool-confirmed</span>
  ) : (
    <span className="rounded bg-violet-500/10 px-2 py-0.5 text-xs text-violet-300 ring-1 ring-violet-500/30">AI-suggested</span>
  );
}
