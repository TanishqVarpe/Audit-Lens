"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CallableBy, MapContract, MapFunction } from "@/lib/contractmap";
import { useCodeViewer } from "./CodeViewer";

const ACCESS: Record<CallableBy, [string, string, string]> = {
  anyone: ["anyone", "bg-amber-400/15 text-amber-200 ring-amber-400/40", "Callable by any address"],
  restricted: ["restricted", "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30", "Caller is checked"],
  weak: ["tx.origin", "bg-red-500/15 text-red-300 ring-red-500/40", "Checked with tx.origin, which can be phished"],
  internal: ["internal", "bg-mocha-500/10 text-mocha-400 ring-mocha-600", "Only callable from inside the contract"],
};

interface Edge {
  from: string;
  to: string;
  d: string;
}

export function ContractMap({ contracts }: { contracts: MapContract[] }) {
  const view = useCodeViewer();
  const box = useRef<HTMLDivElement>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const [edges, setEdges] = useState<Edge[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [onlyRisky, setOnlyRisky] = useState(false);

  const all = contracts.flatMap((c) => c.functions);
  const risky = all.filter((f) => f.risky);
  const shown = contracts
    .map((c) => ({ ...c, functions: onlyRisky ? c.functions.filter((f) => f.risky) : c.functions }))
    .filter((c) => c.functions.length);

  // Draw call edges from measured row positions; redraw on resize.
  const measure = () => {
    const root = box.current?.getBoundingClientRect();
    if (!root) return;
    const out: Edge[] = [];
    for (const f of all) {
      for (const to of f.calls) {
        const a = rows.current.get(f.id)?.getBoundingClientRect();
        const b = rows.current.get(to)?.getBoundingClientRect();
        if (!a || !b) continue;
        const ay = a.top + a.height / 2 - root.top;
        const by = b.top + b.height / 2 - root.top;
        let d: string;
        if (Math.abs(a.left - b.left) < 4) {
          // Same column: arc out to the right.
          const x = a.right - root.left;
          const bulge = 14 + Math.min(40, Math.abs(by - ay) / 6);
          d = `M ${x} ${ay} C ${x + bulge} ${ay}, ${x + bulge} ${by}, ${x + 2} ${by}`;
        } else {
          const rightward = b.left > a.left;
          const x1 = (rightward ? a.right : a.left) - root.left;
          const x2 = (rightward ? b.left : b.right) - root.left;
          const mid = (x1 + x2) / 2;
          d = `M ${x1} ${ay} C ${mid} ${ay}, ${mid} ${by}, ${x2} ${by}`;
        }
        out.push({ from: f.id, to, d });
      }
    }
    setEdges(out);
  };
  useLayoutEffect(measure, [contracts, onlyRisky]);
  useEffect(() => {
    const ro = new ResizeObserver(() => measure());
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [contracts, onlyRisky]);

  if (!all.length) {
    return <p className="rounded-xl border border-mocha-800 p-6 text-sm text-mocha-500">No contracts or functions could be parsed from the stored source.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-mocha-400">
        <span>
          {contracts.length} contract(s) · {all.length} function(s) ·{" "}
          <b className={risky.length ? "text-red-300" : "text-emerald-300"}>{risky.length} risky</b>
        </span>
        <span className="flex flex-wrap gap-2">
          {(Object.keys(ACCESS) as CallableBy[]).map((k) => (
            <span key={k} title={ACCESS[k][2]} className={`rounded px-1.5 py-0.5 ring-1 ${ACCESS[k][1]}`}>
              {ACCESS[k][0]}
            </span>
          ))}
          <Tag kind="eth" /> <Tag kind="ext" /> <Tag kind="dc" />
        </span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={onlyRisky} onChange={(e) => setOnlyRisky(e.target.checked)} className="accent-lavender-400" />
          Only risky
        </label>
      </div>

      <div ref={box} className="relative grid gap-y-6 pr-14">
        {shown.map((c) => (
          <div key={`${c.file}:${c.name}`} className="glass relative z-10 h-fit rounded-2xl">
            <div className="border-b border-mocha-800 px-3 py-2">
              <div className="font-medium text-mocha-100">{c.name}</div>
              <div className="font-mono text-[11px] text-mocha-500">
                {c.kind} · {c.file}
              </div>
            </div>
            <ul className="p-1.5">
              {c.functions.map((f) => (
                <FnRow
                  key={f.id}
                  f={f}
                  dim={!!hover && hover !== f.id && !edges.some((e) => (e.from === hover && e.to === f.id) || (e.to === hover && e.from === f.id))}
                  setRef={(el) => (el ? rows.current.set(f.id, el) : rows.current.delete(f.id))}
                  onHover={setHover}
                  onOpen={() => view({ path: f.file, line: f.start, end: f.end, title: `${f.contract}.${f.name}()` })}
                />
              ))}
            </ul>
          </div>
        ))}
        <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
          <defs>
            <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const active = hover === e.from || hover === e.to;
            return (
              <path
                key={i}
                d={e.d}
                fill="none"
                markerEnd="url(#arrow)"
                className={active ? "text-lavender-300" : "text-mocha-600"}
                stroke="currentColor"
                strokeWidth={active ? 1.75 : 1}
                opacity={hover && !active ? 0.15 : 0.9}
              />
            );
          })}
        </svg>
      </div>

      {risky.length > 0 && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/[0.06] p-5">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-red-300">Risky functions</h3>
          <ul className="space-y-1 text-sm">
            {risky.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => view({ path: f.file, line: f.start, end: f.end, title: `${f.contract}.${f.name}()` })}
                  className="font-mono text-lavender-200 hover:underline"
                >
                  {f.contract}.{f.name}()
                </button>
                <span className="text-mocha-400"> · {f.riskReasons.join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-mocha-600">
        Built by parsing the source, so it works even when the project doesn&apos;t compile. Arrows are internal calls. Click a function to open it.
      </p>
    </div>
  );
}

function FnRow({
  f,
  dim,
  setRef,
  onHover,
  onOpen,
}: {
  f: MapFunction;
  dim: boolean;
  setRef: (el: HTMLElement | null) => void;
  onHover: (id: string | null) => void;
  onOpen: () => void;
}) {
  const [label, style, tip] = ACCESS[f.callableBy];
  return (
    <li ref={setRef}>
      <button
        onClick={onOpen}
        onMouseEnter={() => onHover(f.id)}
        onMouseLeave={() => onHover(null)}
        title={f.risky ? `Risky: ${f.riskReasons.join("; ")}` : `${tip}${f.guard ? ` (${f.guard})` : ""}`}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition ${
          f.risky ? "bg-red-500/10 ring-1 ring-red-500/50" : "hover:bg-mocha-800"
        } ${dim ? "opacity-40" : ""} ${f.callableBy === "internal" ? "text-mocha-400" : "text-mocha-100"}`}
      >
        <span className="truncate font-mono">
          {f.name}
          <span className="text-mocha-500">()</span>
        </span>
        {f.findings.length > 0 && <span className="text-[10px] text-red-300">●{f.findings.length}</span>}
        <span className="ml-auto flex shrink-0 gap-1">
          {f.sendsEth && <Tag kind="eth" />}
          {f.externalCall && <Tag kind="ext" />}
          {f.delegatecall && <Tag kind="dc" />}
          <span className={`rounded px-1.5 py-0.5 text-[10px] ring-1 ${style}`}>{label}</span>
        </span>
      </button>
    </li>
  );
}

const TAGS = {
  eth: ["ETH", "Sends ETH / funds", "text-orange-300 ring-orange-500/40"],
  ext: ["EXT", "Calls external code", "text-sky-300 ring-sky-500/40"],
  dc: ["DELEGATE", "Uses delegatecall", "text-red-300 ring-red-500/50"],
} as const;

function Tag({ kind }: { kind: keyof typeof TAGS }) {
  const [t, tip, cls] = TAGS[kind];
  return (
    <span title={tip} className={`rounded px-1.5 py-0.5 text-[10px] ring-1 ${cls}`}>
      {t}
    </span>
  );
}
