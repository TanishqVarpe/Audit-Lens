import { NextResponse } from "next/server";
import { toMarkdown } from "@/lib/export";
import { loadReport } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });

  const format = new URL(req.url).searchParams.get("format");
  if (format === "md") {
    return new NextResponse(toMarkdown(report), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="auditlens-${id}.md"`,
      },
    });
  }
  return NextResponse.json(report);
}
