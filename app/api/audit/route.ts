import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { extractZip, fetchGithub } from "@/lib/ingest";
import { fetchDeployed } from "@/lib/onchain";
import { runAudit } from "@/lib/pipeline";
import { saveReport } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_UPLOAD = 20 * 1024 * 1024;

export async function POST(req: Request) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "auditlens-"));
  try {
    const form = await req.formData();
    const mode = String(form.get("mode") ?? "");
    let root: string;
    let projectName: string;
    let origin: string | undefined;

    if (mode === "paste") {
      const code = String(form.get("code") ?? "");
      if (!code.trim()) return bad("Paste some Solidity code first.");
      if (code.length > 500_000) return bad("Pasted code is too long (limit 500 KB).");
      const name = String(form.get("filename") || "Contract.sol").replace(/[^\w.-]/g, "_");
      await fs.writeFile(path.join(tmp, name.endsWith(".sol") ? name : `${name}.sol`), code);
      root = tmp;
      projectName = name.replace(/\.sol$/, "");
    } else if (mode === "zip") {
      const file = form.get("file");
      if (!(file instanceof File)) return bad("Choose a .zip file first.");
      if (file.size > MAX_UPLOAD) return bad("Zip is larger than 20 MB.");
      root = await extractZip(Buffer.from(await file.arrayBuffer()), tmp);
      projectName = file.name.replace(/\.zip$/i, "");
    } else if (mode === "github") {
      const r = await fetchGithub(String(form.get("url") ?? ""), tmp);
      root = r.root;
      projectName = r.name;
      origin = String(form.get("url")).trim();
    } else if (mode === "address") {
      const r = await fetchDeployed(Number(form.get("chain_id")), String(form.get("address") ?? ""), tmp);
      root = tmp;
      projectName = r.name;
      origin = r.origin;
    } else if (mode === "sample") {
      root = path.join(process.cwd(), "samples");
      projectName = "VulnerableVault (sample)";
    } else if (mode === "sample-soroban") {
      root = path.join(process.cwd(), "samples", "soroban-vault");
      projectName = "Soroban vault (sample)";
    } else {
      return bad("Unknown input mode.");
    }

    const report = await runAudit({ root, projectName, origin, log: (m) => console.log(`[audit] ${m}`) });
    await saveReport(report);
    return NextResponse.json({ id: report.report_id });
  } catch (e: unknown) {
    console.error("[audit] failed", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Audit failed." }, { status: 500 });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}
