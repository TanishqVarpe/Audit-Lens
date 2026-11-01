import Link from "next/link";
import { comparisonLine } from "@/lib/export";
import { GRADE_COLOR, type Grade } from "@/lib/score";
import type { Comparison } from "@/lib/types";
import { SeverityBadge } from "./SeverityBadge";

export function ComparisonBanner({ c }: { c: Comparison }) {
  const improved = c.fixed.length > 0 && c.added.length === 0;
  return (
    <section
      className={`glass animate-fade-up space-y-4 rounded-3xl p-6 ${improved ? "!border-emerald-400/40 shadow-[0_0_50px_-20px_rgba(52,211,153,0.5)]" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium uppercase tracking-widest text-mocha-400">Re-audit result</h2>
        <span className="flex items-center gap-1.5 text-sm">
          <GradeChip g={c.grade_before as Grade} />
          <span className="text-mocha-500">→</span>
          <GradeChip g={c.grade_after as Grade} />
        </span>
        <Link href={`/report/${c.parent_id}`} className="ml-auto text-xs text-mocha-500 hover:text-mocha-300">
          ← previous report
        </Link>
      </div>
      <p className="text-lg font-medium text-mocha-100">{comparisonLine(c)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <List title={`Fixed (${c.fixed.length})`} items={c.fixed} empty="none" tone="text-emerald-300" mark="✓" />
        <List title={`New (${c.added.length})`} items={c.added} empty="none" tone="text-red-300" mark="+" />
      </div>
    </section>
  );
}

function GradeChip({ g }: { g: Grade }) {
  return (
    <span className="grid h-7 w-7 place-items-center rounded-md text-sm font-bold text-mocha-950" style={{ backgroundColor: GRADE_COLOR[g] }}>
      {g}
    </span>
  );
}

function List({
  title,
  items,
  empty,
  tone,
  mark,
}: {
  title: string;
  items: Comparison["fixed"];
  empty: string;
  tone: string;
  mark: string;
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs uppercase tracking-wide text-mocha-500">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-mocha-500">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((f, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className={tone}>{mark}</span>
              <SeverityBadge severity={f.severity} />
              <span className="text-mocha-200">{f.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
