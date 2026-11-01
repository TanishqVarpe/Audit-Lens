import type { Severity } from "@/lib/types";

export const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-red-500/15 text-red-300 ring-red-500/40",
  high: "bg-orange-500/15 text-orange-300 ring-orange-500/40",
  medium: "bg-amber-400/15 text-amber-200 ring-amber-400/40",
  low: "bg-sky-500/15 text-sky-300 ring-sky-500/40",
  info: "bg-mocha-500/15 text-mocha-300 ring-mocha-500/40",
  optimization: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${SEVERITY_STYLE[severity]}`}>
      {severity}
    </span>
  );
}
