import { NextResponse } from "next/server";
import { generateExploit } from "@/lib/exploit";
import { generateFix } from "@/lib/fix";
import { llmConfig } from "@/lib/gemma";
import { loadReport, updateReport } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * Per-finding actions:
 *   fix      Gemma writes a patch; code applies it, diffs it and compile-checks it
 *   apply    lay the patch over the report's working copy (for a re-audit)
 *   unapply  remove it again
 *   exploit  Gemma writes a Foundry test; forge decides if the exploit is confirmed
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { action, finding_id } = (await req.json()) as { action: string; finding_id: string };
    const report = await loadReport(id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    const finding = report.findings.find((f) => f.id === finding_id);
    if (!finding) return NextResponse.json({ error: "Finding not found." }, { status: 404 });

    if (action === "fix" || action === "exploit") {
      const cfg = llmConfig();
      if (!cfg) return NextResponse.json({ error: "No LLM is configured, so AuditLens can't write a fix or test." }, { status: 400 });
      const saved =
        action === "fix"
          ? await generateFix(cfg, report, finding).then((fix) => updateReport(id, (r) => void (r.findings.find((x) => x.id === finding_id)!.fix = fix)))
          : await generateExploit(cfg, report, finding).then((ex) => updateReport(id, (r) => void (r.findings.find((x) => x.id === finding_id)!.exploit = ex)));
      return NextResponse.json({ findings: saved!.findings, working: Object.keys(saved!.working ?? {}) });
    }

    if (action === "apply" || action === "unapply") {
      if (!finding.fix) return NextResponse.json({ error: "Generate a fix first." }, { status: 400 });
      const saved = await updateReport(id, (r) => {
        const f = r.findings.find((x) => x.id === finding_id)!;
        r.working ??= {};
        const sameFile = r.findings.filter((o) => o !== f && o.fix?.file === f.fix!.file);
        if (action === "apply") {
          r.working[f.fix!.file] = f.fix!.patched;
          // The patch contains exactly the fixes it was built on; any other fix to this file is replaced.
          for (const o of sameFile) o.fix!.applied = (f.fix!.base_fixes ?? []).includes(o.id);
        } else {
          // The working copy is per file, so undoing restores the original file and every fix in it.
          delete r.working[f.fix!.file];
          for (const o of sameFile) o.fix!.applied = false;
        }
        f.fix!.applied = action === "apply";
      });
      return NextResponse.json({ findings: saved!.findings, working: Object.keys(saved!.working ?? {}) });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    console.error("[finding] failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed." }, { status: 500 });
  }
}
