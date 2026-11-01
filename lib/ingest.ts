import fs from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import type { Chain, SourceFile } from "./types";

const SKIP_DIRS = new Set(["node_modules", "lib", "test", "tests", "mocks", "mock", ".git", "out", "cache", "artifacts", "broadcast", "target"]);
const MAX_FILES = 200;
const MAX_FILE_BYTES = 500_000;

/** Recursively collect .sol files under root (skipping deps, tests and mocks). */
export function collectSolFiles(root: string): Promise<SourceFile[]> {
  return collectFiles(root, (n) => n.endsWith(".sol"));
}

/**
 * Collect the project's contracts and detect the chain: Solidity if there are any
 * .sol files, otherwise Soroban if there are Rust sources.
 */
export async function collectSources(root: string): Promise<{ chain: Chain; files: SourceFile[]; support: SourceFile[] }> {
  const sol = await collectFiles(root, (n) => n.endsWith(".sol"));
  const chain: Chain = sol.length ? "solidity" : "soroban";
  const files = sol.length ? sol : await collectFiles(root, (n) => n.endsWith(".rs"));
  // Build files needed to compile the project again for a re-audit.
  const names = chain === "soroban" ? ["Cargo.toml", "Cargo.lock"] : ["foundry.toml", "remappings.txt", "hardhat.config.js", "hardhat.config.ts"];
  const support = await collectFiles(root, (n) => names.includes(n));
  return { chain, files, support };
}

/** Write files under dir (used to re-audit patched code and to run exploit tests). */
export async function writeSources(files: SourceFile[], dir: string): Promise<void> {
  const base = path.resolve(dir);
  for (const f of files) {
    const target = path.resolve(base, f.path);
    if (!target.startsWith(base + path.sep)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, f.content);
  }
}

async function collectFiles(root: string, match: (name: string) => boolean): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name.toLowerCase())) await walk(full);
      } else if (e.isFile() && match(e.name)) {
        const stat = await fs.stat(full);
        if (stat.size > MAX_FILE_BYTES) continue;
        out.push({
          path: path.relative(root, full).split(path.sep).join("/"),
          content: (await fs.readFile(full, "utf8")).replace(/\r\n/g, "\n"),
        });
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Render a file with a path header and line numbers so the model can cite lines. */
export function numberFile(f: SourceFile): string {
  const lines = f.content.split("\n");
  const width = String(lines.length).length;
  const body = lines.map((l, i) => `${String(i + 1).padStart(width)} | ${l}`).join("\n");
  return `===== FILE: ${f.path} =====\n${body}`;
}

/** Extract a zip safely into dest. Returns the project root (unwraps a single top-level folder). */
export async function extractZip(buf: Buffer, dest: string): Promise<string> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buf);
  } catch {
    throw new Error("That file is not a valid .zip archive.");
  }
  const destAbs = path.resolve(dest);
  let total = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const target = path.resolve(destAbs, entry.entryName);
    if (!target.startsWith(destAbs + path.sep)) continue; // zip-slip guard
    total += entry.header.size;
    if (total > 100_000_000) throw new Error("Zip is too large when extracted (limit 100 MB).");
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.getData());
  }
  const top = await fs.readdir(destAbs, { withFileTypes: true });
  if (top.length === 1 && top[0].isDirectory()) return path.join(destAbs, top[0].name);
  return destAbs;
}

const GH_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([\w./-]+))?\/?$/;

/** Download a public GitHub repo as a zip and extract it. */
export async function fetchGithub(url: string, dest: string): Promise<{ root: string; name: string }> {
  const m = url.trim().match(GH_RE);
  if (!m) throw new Error("Enter a GitHub URL like https://github.com/owner/repo");
  const [, owner, repo, ref] = m;
  const api = `https://api.github.com/repos/${owner}/${repo}/zipball${ref ? `/${ref}` : ""}`;
  const res = await fetch(api, { headers: { "User-Agent": "auditlens" }, redirect: "follow" });
  if (!res.ok) throw new Error(`GitHub download failed (${res.status}). Is the repo public?`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 50_000_000) throw new Error("Repository zip is larger than 50 MB.");
  return { root: await extractZip(buf, dest), name: repo };
}
