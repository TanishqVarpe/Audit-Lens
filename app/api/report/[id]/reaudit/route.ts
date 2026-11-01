import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { currentFiles } from "@/lib/fix";
import { writeSources } from "@/lib/ingest";
import { runAudit } from "@/lib/pipeline";
import { loadReport, saveReport } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Audit the report's code again, with applied fixes, and compare with this report. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parent = await loadReport(id);
  if (!parent) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  if (!parent.sources?.length) {
    return NextResponse.json({ error: "This report keeps no source, so it can't be re-audited." }, { status: 400 });
  }

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auditlens-re-"));
  try {
    await writeSources(currentFiles(parent), tmp);
    const report = await runAudit({
      root: tmp,
      projectName: parent.project_name,
      origin: parent.origin,
      parent,
      log: (m) => console.log(`[reaudit] ${m}`),
    });
    await saveReport(report);
    return NextResponse.json({ id: report.report_id });
  } catch (e) {
    console.error("[reaudit] failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Re-audit failed." }, { status: 500 });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
