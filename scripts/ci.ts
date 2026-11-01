/**
 * GitHub Action entry point (see action.yml). On a pull request it audits only the
 * functions that changed against the base commit, comments the findings on the PR,
 * and exits 1 if any finding is at or above FAIL_ON, so a required check blocks the merge.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH (set by Actions),
 *      AUDIT_PATH (default "."), FAIL_ON (critical|high|medium|low|none, default high),
 *      plus the usual LLM variables.
 */
import fs from "node:fs";
import path from "node:path";
import { changedFunctions, filesAtRef } from "../lib/diffmode";
import { TOOL_LABEL } from "../lib/export";
import { collectSources } from "../lib/ingest";
import { runAudit } from "../lib/pipeline";
import { riskScore } from "../lib/score";
import type { Report, Severity } from "../lib/types";
import { SEVERITY_ORDER } from "../lib/types";
import { loadEnv } from "./env";

loadEnv();

const MARKER = "<!-- auditlens-pr-bot -->";
const ICON: Record<Severity, string> = { critical: "🟥", high: "🟧", medium: "🟨", low: "🟦", info: "⬜", optimization: "🟩" };

function comment(r: Report | null, changed: number, failOn: string, blocking: number): string {
  const out = [MARKER, "## 🔍 AuditLens"];
  if (!r) {
    out.push("", "No contract functions changed in this PR. Nothing to audit.");
    return out.join("\n");
  }
  const risk = riskScore(r.summary);
  const visible = r.findings.filter((f) => f.status !== "false_positive");
  out.push(
    "",
    `Audited **${changed} changed function(s)** · ${r.analyzer} · model: ${r.model}`,
    "",
    blocking
      ? `### ❌ ${blocking} finding(s) at or above \`${failOn}\`. Merge is blocked until they are fixed or dismissed.`
      : visible.length
        ? `### ⚠️ ${visible.length} finding(s), none at or above \`${failOn}\`.`
        : "### ✅ No new findings in the changed code.",
    "",
    `Grade for the changed code: **${risk.grade}** (${risk.score}/100)`,
  );
  if (visible.length) {
    out.push("", "| | Severity | Finding | Location | Source |", "|---|---|---|---|---|");
    for (const f of visible) {
      out.push(
        `| ${ICON[f.severity]} | ${f.severity} | ${f.title.replace(/\|/g, "\\|")} | \`${f.file_name}:${f.line}\` | ${f.source === "ai" ? "AI-suggested" : `${TOOL_LABEL[f.source]} ✓`} |`,
      );
    }
    out.push("", "<details><summary>Details</summary>", "");
    for (const f of visible) {
      out.push(`#### ${f.id} · ${f.title}`, "", "```", f.code_quote, "```", "", f.explanation, "", `**Fix:** ${f.suggested_fix}`, "");
    }
    out.push("</details>");
  }
  out.push("", "<sub>Automated first-pass review. Not a substitute for a professional audit.</sub>");
  return out.join("\n");
}

async function gh(url: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "auditlens",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** Update our previous comment instead of adding a new one on every push. */
async function upsertComment(repo: string, pr: number, body: string) {
  const existing = (await gh(`/repos/${repo}/issues/${pr}/comments?per_page=100`)) as { id: number; body: string }[];
  const mine = existing.find((c) => c.body?.includes(MARKER));
  if (mine) await gh(`/repos/${repo}/issues/comments/${mine.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
  else await gh(`/repos/${repo}/issues/${pr}/comments`, { method: "POST", body: JSON.stringify({ body }) });
}

async function main() {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const root = path.resolve(workspace, process.env.AUDIT_PATH || ".");
  const failOn = (process.env.FAIL_ON || "high").toLowerCase();
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
  const pr = event.pull_request;
  const baseRef = process.env.BASE_REF || pr?.base?.sha;
  if (!baseRef) throw new Error("No base commit: run on pull_request events, or set BASE_REF.");

  const { chain, files } = await collectSources(root);
  const base = await filesAtRef(root, baseRef, chain === "soroban" ? ".rs" : ".sol");
  const focus = changedFunctions(base, files);
  console.log(`Diff against ${baseRef.slice(0, 12)}: ${focus.length} changed function(s)`);

  let report: Report | null = null;
  let blocking = 0;
  if (focus.length) {
    report = await runAudit({ root, projectName: process.env.GITHUB_REPOSITORY || path.basename(root), focus, log: (m) => console.log(`• ${m}`) });
    const limit = SEVERITY_ORDER.indexOf(failOn as Severity);
    blocking =
      limit < 0 ? 0 : report.findings.filter((f) => f.status !== "false_positive" && SEVERITY_ORDER.indexOf(f.severity) <= limit).length;
  }

  const body = comment(report, focus.length, failOn, blocking);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + "\n");
  if (pr && process.env.GITHUB_TOKEN && process.env.GITHUB_REPOSITORY) {
    await upsertComment(process.env.GITHUB_REPOSITORY, pr.number, body);
    console.log("Commented on the pull request.");
  } else {
    console.log(body);
  }
  if (blocking) {
    console.error(`${blocking} finding(s) at or above "${failOn}". Failing the check.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("AuditLens CI failed:", e instanceof Error ? e.message : e);
  process.exit(2);
});
