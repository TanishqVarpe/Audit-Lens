/**
 * Benchmark: run Slither alone and the full AuditLens pipeline on every case in
 * benchmark/cases, score both against benchmark/labels.json, and write
 * benchmark/results.json (shown on the /benchmark page).
 *   npm run benchmark
 */
import fs from "node:fs";
import path from "node:path";
import { score, sum, type BenchmarkResults, type CaseResult, type Label } from "../lib/benchmark";
import { extractFunctions } from "../lib/contractmap";
import { collectSolFiles } from "../lib/ingest";
import { runAudit } from "../lib/pipeline";
import { runSlither, slitherVersion } from "../lib/slither";
import { loadEnv } from "./env";

loadEnv();

const DIR = path.resolve("benchmark");

async function main() {
  const version = await slitherVersion();
  if (!version) throw new Error("Slither is not installed. The benchmark compares against Slither, so it needs it (pip install slither-analyzer).");
  const { labels } = JSON.parse(fs.readFileSync(path.join(DIR, "labels.json"), "utf8")) as { labels: Label[] };
  const cases = fs.readdirSync(path.join(DIR, "cases")).filter((c) => fs.statSync(path.join(DIR, "cases", c)).isDirectory());

  const results: CaseResult[] = [];
  let model = "none";
  let mode = "";
  for (const c of cases) {
    const root = path.join(DIR, "cases", c);
    const files = await collectSolFiles(root);
    // Resolve each label's line and enclosing function from its snippet.
    const mine = labels
      .filter((l) => l.case === c)
      .map((l) => {
        const file = files.find((f) => f.path === l.file);
        const idx = file?.content.split("\n").findIndex((x) => x.includes(l.match)) ?? -1;
        if (!file || idx < 0) throw new Error(`Label not found: ${c}/${l.file}: ${l.match}`);
        const line = idx + 1;
        const fn = extractFunctions(file).find((f) => line >= f.start && line <= f.end);
        return { ...l, line, range: fn ? ([fn.start, fn.end] as [number, number]) : undefined };
      });

    console.log(`\n▶ ${c} (${mine.length} known bug(s))`);
    const s = await runSlither(root);
    if (!s.ok) console.warn(`  Slither failed: ${s.error}`);
    const report = await runAudit({ root, projectName: `benchmark/${c}`, log: (m) => console.log(`  • ${m}`) });
    model = report.model;
    mode = report.mode;

    const slither = score(
      mine,
      s.findings.map((f) => ({ file: f.file, line: f.lines[0] ?? 0, text: `${f.check} ${f.description}`, severity: f.severity })),
    );
    const auditlens = score(
      mine,
      report.findings
        .filter((f) => f.status !== "false_positive")
        .map((f) => ({ file: f.file_name, line: f.line, text: `${f.slither_check ?? ""} ${f.vulnerability_type} ${f.title}`, severity: f.severity })),
    );
    console.log(`  Slither:   ${slither.tp} TP, ${slither.fp} FP, ${slither.fn} FN`);
    console.log(`  AuditLens: ${auditlens.tp} TP, ${auditlens.fp} FP, ${auditlens.fn} FN`);
    results.push({ case: c, labels: mine.length, slither, auditlens });
  }

  const total = results.reduce((n, r) => n + r.labels, 0);
  const out: BenchmarkResults = {
    generated_at: new Date().toISOString(),
    analyzer: `slither ${version}`,
    model,
    mode,
    rule: "Findings of severity low and above count. A finding is correct if it is in the right file, on the bug line (±2) or in the same function, and names the right category. Duplicates of one bug count once.",
    cases: results,
    totals: { labels: total, slither: sum(results.map((r) => r.slither), total), auditlens: sum(results.map((r) => r.auditlens), total) },
  };
  fs.writeFileSync(path.join(DIR, "results.json"), JSON.stringify(out, null, 2));
  const pct = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);
  console.log(`\nTotals over ${total} known bugs:`);
  console.log(`  Slither alone: precision ${pct(out.totals.slither.precision)}, recall ${pct(out.totals.slither.recall)}`);
  console.log(`  AuditLens:     precision ${pct(out.totals.auditlens.precision)}, recall ${pct(out.totals.auditlens.recall)}`);
  console.log(`\nWrote benchmark/results.json`);
}

main().catch((e) => {
  console.error("Benchmark failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
