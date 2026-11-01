import { NextResponse } from "next/server";
import { askAboutCode } from "@/lib/ask";
import { llmConfig } from "@/lib/gemma";
import { loadReport } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { question, history } = (await req.json()) as { question: string; history?: { q: string; a: string }[] };
    if (!question?.trim()) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
    if (question.length > 1000) return NextResponse.json({ error: "Keep the question under 1000 characters." }, { status: 400 });
    const report = await loadReport(id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    const cfg = llmConfig();
    if (!cfg) return NextResponse.json({ error: "No LLM is configured, so questions can't be answered." }, { status: 400 });
    return NextResponse.json(await askAboutCode(cfg, report, question.trim(), history ?? []));
  } catch (e) {
    console.error("[ask] failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Question failed." }, { status: 500 });
  }
}
