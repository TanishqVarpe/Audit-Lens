"use client";

import Link from "next/link";
import { useState } from "react";

export interface TrendPoint {
  id: string;
  date: string;
  score: number;
  grade: string;
  findings: number;
}

const W = 640;
const H = 180;
const PAD = { l: 32, r: 12, t: 12, b: 24 };
// Fixed format: locale formatting differs between server and browser and breaks hydration.
const day = (iso: string) => iso.slice(0, 10);

/** Risk score over time for one project (single series, 0–100). */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (data.length < 2) return <p className="text-sm text-mocha-500">Run at least two audits of this project to see a trend.</p>;

  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / (data.length - 1);
  const y = (s: number) => PAD.t + ((100 - s) * (H - PAD.t - PAD.b)) / 100;
  const line = data.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p.score)}`).join(" ");
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Risk score over time">
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(g)} y2={y(g)} stroke="#3a2d26" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(g) + 3} textAnchor="end" fontSize={10} fill="#8a7e75">
              {g}
            </text>
          </g>
        ))}
        {h && <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={H - PAD.b} stroke="#6a5a50" strokeDasharray="3 3" />}
        <path d={line} fill="none" stroke="#c4b5ec" strokeWidth={2} strokeLinejoin="round" />
        {data.map((p, i) => (
          <g key={p.id}>
            <circle cx={x(i)} cy={y(p.score)} r={4.5} fill="#c4b5ec" stroke="#1b1411" strokeWidth={2} />
            {/* Hit target wider than the mark. */}
            <rect
              x={x(i) - (W - PAD.l - PAD.r) / (data.length - 1) / 2}
              y={PAD.t}
              width={(W - PAD.l - PAD.r) / (data.length - 1)}
              height={H - PAD.t - PAD.b}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
        <text x={PAD.l} y={H - 6} fontSize={10} fill="#8a7e75">
          {day(data[0].date)}
        </text>
        <text x={W - PAD.r} y={H - 6} fontSize={10} fill="#8a7e75" textAnchor="end">
          {day(data[data.length - 1].date)}
        </text>
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-mocha-700 bg-mocha-900 px-2 py-1 text-xs text-mocha-200 shadow"
          style={{ left: `${(x(hover!) / W) * 100}%`, top: 0 }}
        >
          <div className="font-medium">
            Grade {h.grade} · {h.score}/100
          </div>
          <div className="text-mocha-400">
            {h.findings} finding(s) · {new Date(h.date).toLocaleString()}
          </div>
        </div>
      )}
      <p className="mt-1 text-xs text-mocha-600">
        Risk score (higher is safer). Latest:{" "}
        <Link href={`/report/${data[data.length - 1].id}`} className="text-mocha-400 hover:text-mocha-200">
          grade {data[data.length - 1].grade}
        </Link>
      </p>
    </div>
  );
}
