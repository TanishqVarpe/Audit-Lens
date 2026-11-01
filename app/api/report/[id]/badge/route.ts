import { NextResponse } from "next/server";
import { badgeSvg, riskScore } from "@/lib/score";
import { loadReport } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** README badge: ![AuditLens](https://<host>/api/report/<id>/badge) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const { grade, score } = riskScore(report.summary);
  return new NextResponse(badgeSvg(grade, score), {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "max-age=300" },
  });
}
