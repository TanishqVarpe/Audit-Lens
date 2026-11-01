/**
 * CLI: run the full pipeline without the web UI.
 *   npm run audit -- <folder> [--md] [--diff <git-ref>]
 * --diff audits only the functions that changed since <git-ref> (e.g. origin/main).
 * Reads .env / .env.local if present.
 */
import path from "node:path";
import { changedFunctions, filesAtRef } from "../lib/diffmode";
import { toMarkdown } from "../lib/export";
import { collectSources } from "../lib/ingest";
import { runAudit } from "../lib/pipeline";
import { riskScore } from "../lib/score";
import { saveReport } from "../lib/storage";
import type { FocusRange } from "../lib/types";
import { loadEnv } from "./env";

loadEnv();

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const target = process.argv[2];
  if (!target || target.startsWith("--")) {
    console.error("Usage: npm run audit -- <folder> [--md] [--diff <git-ref>]");
    process.exit(1);
  }
  const root = path.resolve(target);

  let focus: FocusRange[] | undefined;
  const ref = arg("--diff");
  if (ref) {
    const { chain, files } = await collectSources(root);
    const base = await filesAtRef(root, ref, chain === "soroban" ? ".rs" : ".sol");
    focus = changedFunctions(base, files);
    console.log(`• Diff mode against ${ref}: ${focus.length} changed function(s)`);
    for (const f of focus) console.log(`    ${f.name} (${f.file}:${f.start}-${f.end})`);
    if (!focus.length) {
      console.log("\nNo contract functions changed. Nothing to audit.");
      return;
    }
  }

  const report = await runAudit({ root, projectName: path.basename(root), focus, log: (m) => console.log(`• ${m}`) });
  await saveReport(report);
  const risk = riskScore(report.summary);
  if (process.argv.includes("--md")) {
    console.log("\n" + toMarkdown(report));
  } else {
    console.log(`\nReport ${report.report_id}: grade ${risk.grade} (${risk.score}/100), ${report.findings.length} finding(s)`);
    for (const f of report.findings) {
      console.log(`  ${f.id} [${f.severity}] ${f.title} (${f.file_name}:${f.line}) ${f.source}${f.verified ? " ✓" : ""}`);
    }
    if (report.warnings.length) console.log("\nWarnings:\n  " + report.warnings.join("\n  "));
  }
}

main().catch((e) => {
  console.error("Audit failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
