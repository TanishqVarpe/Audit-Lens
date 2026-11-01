"use client";

import { useState } from "react";
import { GRADE_COLOR, type RiskScore } from "@/lib/score";

const R = 46;
const C = 2 * Math.PI * R;

/** 3D grade tile next to an animated score ring, plus the README badge. */
export function RiskGrade({ risk, reportId }: { risk: RiskScore; reportId: string }) {
  const [copied, setCopied] = useState(false);
  const color = GRADE_COLOR[risk.grade];

  function copy() {
    const base = window.location.origin;
    const md = `[![AuditLens](${base}/api/report/${reportId}/badge)](${base}/report/${reportId})`;
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center gap-5">
        {/* Floating 3D tile: a lit face plus two shaded sides. */}
        <div className="animate-float shrink-0 [perspective:600px]">
          <div className="relative h-20 w-20 [transform-style:preserve-3d] [transform:rotateX(14deg)_rotateY(-22deg)]">
            <div
              className="absolute inset-0 grid place-items-center rounded-2xl text-5xl font-black text-mocha-950"
              style={{ background: `linear-gradient(145deg, #fff8, transparent 55%), ${color}`, boxShadow: `0 18px 40px -12px ${color}` }}
              aria-label={`Risk grade ${risk.grade}`}
            >
              {risk.grade}
            </div>
            <div className="absolute inset-y-0 right-0 w-5 origin-right rounded-r-2xl brightness-50" style={{ background: color, transform: "rotateY(90deg) translateZ(0px)" }} />
            <div className="absolute inset-x-0 bottom-0 h-5 origin-bottom rounded-b-2xl brightness-[0.35]" style={{ background: color, transform: "rotateX(-90deg)" }} />
          </div>
        </div>

        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
            <circle cx="55" cy="55" r={R} fill="none" stroke="#3a2d26" strokeWidth="9" />
            <circle
              cx="55"
              cy="55"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - risk.score / 100)}
              className="[transition:stroke-dashoffset_1.4s_cubic-bezier(0.2,0.7,0.2,1)] [animation:gauge_1.4s_cubic-bezier(0.2,0.7,0.2,1)_both]"
              style={{ ["--gauge-from" as string]: C, filter: `drop-shadow(0 0 6px ${color}88)` }}
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <span className="text-2xl font-semibold text-mocha-50">{risk.score}</span>
            <span className="text-[10px] uppercase tracking-widest text-mocha-500">of 100</span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs uppercase tracking-widest text-mocha-500">Risk grade</p>
      <p className="text-sm text-mocha-200">{risk.reason}</p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-mocha-700/60 pt-4">
        <img src={`/api/report/${reportId}/badge`} alt={`AuditLens ${risk.grade}`} height={20} />
        <button onClick={copy} className="text-xs text-lavender-300 transition hover:text-lavender-100">
          {copied ? "✓ Copied" : "Copy README badge"}
        </button>
      </div>
    </section>
  );
}
