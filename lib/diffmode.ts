import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extractFunctions } from "./contractmap";
import type { FocusRange, SourceFile } from "./types";

const run = promisify(execFile);
const squash = (s: string) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");

/**
 * Functions that are new or whose body changed between base and head.
 * Comment and whitespace-only changes are ignored.
 */
export function changedFunctions(base: SourceFile[], head: SourceFile[]): FocusRange[] {
  const out: FocusRange[] = [];
  for (const h of head) {
    const b = base.find((f) => f.path === h.path);
    const before = new Map(
      (b ? extractFunctions(b) : []).map((f) => [f.id, squash(b!.content.split("\n").slice(f.start - 1, f.end).join("\n"))]),
    );
    const lines = h.content.split("\n");
    for (const f of extractFunctions(h)) {
      const body = squash(lines.slice(f.start - 1, f.end).join("\n"));
      if (before.get(f.id) !== body) out.push({ file: h.path, name: f.id, start: f.start, end: f.end });
    }
  }
  return out;
}

/** Contract files as they were at a git ref (e.g. origin/main), paths relative to root. */
export async function filesAtRef(root: string, ref: string, ext: string): Promise<SourceFile[]> {
  const git = (args: string[]) => run("git", args, { cwd: root, maxBuffer: 50 * 1024 * 1024 }).then((r) => r.stdout);
  // ls-tree prints paths relative to cwd; "ref:./path" resolves them the same way.
  const names = (await git(["ls-tree", "-r", "--name-only", ref, "--", "."]))
    .split("\n")
    .filter((n) => n.endsWith(ext));
  const files: SourceFile[] = [];
  for (const n of names) {
    files.push({ path: n, content: (await git(["show", `${ref}:./${n}`])).replace(/\r\n/g, "\n") });
  }
  return files;
}

export const inFocus = (focus: FocusRange[], file: string, line: number) =>
  focus.some((r) => r.file === file && line >= r.start && line <= r.end);
