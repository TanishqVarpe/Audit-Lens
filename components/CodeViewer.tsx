"use client";

import { diffLines } from "diff";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { highlightLines, langOf, TOKEN_CLASS } from "@/lib/highlight";
import type { Finding, Severity } from "@/lib/types";

const CONTEXT_LINES = 3;

interface Target {
  path: string;
  line: number;
  end?: number;
  title?: string;
}
interface FileData {
  content: string;
  patched: string | null;
}

const Ctx = createContext<(t: Target) => void>(() => {});
/** open({ path, line }) shows the whole file with that line highlighted. */
export const useCodeViewer = () => useContext(Ctx);

const DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-sky-500",
  info: "bg-mocha-500",
  optimization: "bg-emerald-500",
};

export function CodeViewerProvider({ reportId, findings, children }: { reportId: string; findings: Finding[]; children: React.ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const cache = useRef(new Map<string, FileData>());
  const open = useCallback((t: Target) => setTarget(t), []);
  // Patched content changes when fixes are applied, so drop the cache when findings change.
  useEffect(() => cache.current.clear(), [findings]);

  return (
    <Ctx.Provider value={open}>
      {children}
      {target && (
        <CodeModal
          key={`${target.path}:${target.line}`}
          reportId={reportId}
          target={target}
          findings={findings.filter((f) => f.file_name === target.path && f.status !== "false_positive")}
          cache={cache.current}
          onClose={() => setTarget(null)}
        />
      )}
    </Ctx.Provider>
  );
}

function CodeModal({
  reportId,
  target,
  findings,
  cache,
  onClose,
}: {
  reportId: string;
  target: Target;
  findings: Finding[];
  cache: Map<string, FileData>;
  onClose: () => void;
}) {
  const [data, setData] = useState<FileData | null>(cache.get(target.path) ?? null);
  const [error, setError] = useState("");
  const [showPatched, setShowPatched] = useState(false);
  const hit = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cache.has(target.path)) return;
    fetch(`/api/report/${reportId}/file?path=${encodeURIComponent(target.path)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        const d = { content: j.content, patched: j.patched };
        cache.set(target.path, d);
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [reportId, target.path, cache]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patched = showPatched && data?.patched != null;
  const src = patched ? data!.patched! : data?.content ?? "";
  const lines = useMemo(() => highlightLines(src, langOf(target.path)), [src, target.path]);

  // In patched view, mark added lines instead of the finding line.
  const added = useMemo(() => {
    if (!patched || !data) return new Set<number>();
    const set = new Set<number>();
    let n = 0;
    for (const part of diffLines(data.content, data.patched!)) {
      const count = part.count ?? part.value.split("\n").length - 1;
      if (part.added) for (let k = 1; k <= count; k++) set.add(n + k);
      if (!part.removed) n += count;
    }
    return set;
  }, [patched, data]);

  useEffect(() => {
    hit.current?.scrollIntoView({ block: "center" });
  }, [lines, target.line]);

  const end = target.end ?? target.line;
  const scrollTo = patched ? Math.min(...added) : target.line;
  const markers = new Map<number, Finding[]>();
  if (!patched) for (const f of findings) markers.set(f.line, [...(markers.get(f.line) ?? []), f]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Source of ${target.path}`}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-mocha-700 bg-mocha-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-mocha-800 px-4 py-3">
          <span className="font-mono text-sm text-mocha-200">
            {target.path}
            <span className="text-mocha-500">:{target.line}</span>
          </span>
          {target.title && <span className="truncate text-sm text-mocha-500">· {target.title}</span>}
          {data?.patched != null && (
            <span className="ml-auto flex rounded-md bg-mocha-900 p-0.5 text-xs">
              {(["Original", "With applied fix"] as const).map((label, i) => (
                <button
                  key={label}
                  onClick={() => setShowPatched(i === 1)}
                  className={`rounded px-2 py-1 ${showPatched === (i === 1) ? "bg-mocha-700 text-mocha-50" : "text-mocha-400"}`}
                >
                  {label}
                </button>
              ))}
            </span>
          )}
          <button onClick={onClose} className={`${data?.patched != null ? "" : "ml-auto"} text-mocha-400 hover:text-mocha-100`} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="overflow-auto py-2 font-mono text-xs leading-5">
          {error && <p className="px-4 py-6 text-sm text-red-400">{error}</p>}
          {!data && !error && <p className="px-4 py-6 text-sm text-mocha-500">Loading…</p>}
          {data &&
            lines.map((tokens, i) => {
              const n = i + 1;
              const isHit = !patched && n >= target.line && n <= end;
              const near = !patched && n >= target.line - CONTEXT_LINES && n <= end + CONTEXT_LINES;
              const isAdded = added.has(n);
              const marks = markers.get(n);
              return (
                <div
                  key={n}
                  ref={n === scrollTo ? hit : undefined}
                  className={`flex whitespace-pre ${
                    isHit ? "bg-lavender-400/15 ring-1 ring-inset ring-lavender-400/40" : isAdded ? "bg-emerald-500/10" : near ? "bg-mocha-900" : ""
                  }`}
                >
                  <span className="w-4 shrink-0 select-none pl-1.5 pt-1.5">
                    {marks && <span title={marks.map((m) => `${m.id} ${m.title}`).join("\n")} className={`block h-2 w-2 rounded-full ${DOT[marks[0].severity]}`} />}
                    {isAdded && <span className="-mt-1.5 block text-emerald-400">+</span>}
                  </span>
                  <span className={`w-12 shrink-0 select-none pr-3 text-right ${isHit ? "text-lavender-300" : "text-mocha-600"}`}>{n}</span>
                  <span className="pr-4">
                    {tokens.map((t, k) => (
                      <span key={k} className={TOKEN_CLASS[t.kind]}>
                        {t.text}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

/** Highlighted code block for diffs and generated tests. */
export function CodeBlock({ code, lang, diff }: { code: string; lang: "solidity" | "rust"; diff?: boolean }) {
  const rows = code.split("\n");
  const tokens = useMemo(
    () => highlightLines(diff ? code.split("\n").map((r) => r.slice(1)).join("\n") : code, lang),
    [code, lang, diff],
  );
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-mocha-950 py-2 font-mono text-xs leading-5 ring-1 ring-mocha-800">
      {rows.map((r, i) => {
        const mark = diff ? r[0] : "";
        const hunk = diff && (r.startsWith("@@") || r.startsWith("---") || r.startsWith("+++"));
        return (
          <div
            key={i}
            className={`whitespace-pre px-3 ${mark === "+" && !hunk ? "bg-emerald-500/10" : mark === "-" && !hunk ? "bg-red-500/10" : ""}`}
          >
            {hunk ? (
              <span className="text-sky-400">{r}</span>
            ) : (
              <>
                {diff && <span className={`select-none ${mark === "+" ? "text-emerald-400" : mark === "-" ? "text-red-400" : "text-mocha-600"}`}>{mark || " "} </span>}
                {tokens[i]?.map((t, k) => (
                  <span key={k} className={TOKEN_CLASS[t.kind]}>
                    {t.text}
                  </span>
                ))}
              </>
            )}
          </div>
        );
      })}
    </pre>
  );
}
