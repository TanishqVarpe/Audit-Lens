import { NextResponse } from "next/server";
import { loadReport } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One source file of a report: the audited original plus the patched version, if any. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const p = new URL(req.url).searchParams.get("path") ?? "";
  const file = report.sources?.find((f) => f.path === p);
  if (!file) {
    return NextResponse.json({ error: "This report does not store that file (older reports keep no source)." }, { status: 404 });
  }
  return NextResponse.json({ path: file.path, content: file.content, patched: report.working?.[file.path] ?? null, chain: report.chain });
}
