import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { writeSources } from "./ingest";
import type { Chain, SourceFile } from "./types";

const run = promisify(execFile);

export interface CompileResult {
  ok: boolean;
  errors: string;
  compiler: string;
}

// The bundled solc-js accepts any 0.8.x code once the pragma is relaxed. That's fine
// for a "does it still compile" check; the note in the report says which compiler ran.
const relaxPragma = (src: string) => src.replace(/pragma\s+solidity\s+[^;]+;/g, "pragma solidity >=0.4.0;");

function compileSolidity(files: SourceFile[], entry: string): CompileResult {
  const solc = require("solc"); // lazy: solc-js is ~8 MB
  const byPath = new Map(files.map((f) => [f.path, relaxPragma(f.content)]));
  const input = {
    language: "Solidity",
    sources: { [entry]: { content: byPath.get(entry) ?? "" } },
    settings: { outputSelection: { "*": { "*": [] } } },
  };
  const findImports = (p: string) => {
    const content = byPath.get(p) ?? byPath.get(p.replace(/^\.\//, ""));
    return content !== undefined ? { contents: content } : { error: `File not found: ${p}` };
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (out.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  return {
    ok: errors.length === 0,
    errors: errors.map((e: { formattedMessage?: string; message: string }) => e.formattedMessage ?? e.message).join("\n").slice(0, 3000),
    compiler: `solc-js ${String(solc.version()).split("+")[0]}`,
  };
}

async function compileRust(files: SourceFile[]): Promise<CompileResult | null> {
  try {
    await run("cargo", ["--version"], { timeout: 10_000 });
  } catch {
    return null; // cargo not installed
  }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "auditlens-cargo-"));
  try {
    await writeSources(files, dir);
    const manifest = files.find((f) => f.path.endsWith("Cargo.toml"));
    if (!manifest) return null;
    await run("cargo", ["check", "--quiet", "--manifest-path", path.join(dir, manifest.path)], { timeout: 600_000, maxBuffer: 20 * 1024 * 1024 });
    return { ok: true, errors: "", compiler: "cargo check" };
  } catch (e) {
    return { ok: false, errors: String((e as { stderr?: string }).stderr ?? e).slice(-3000), compiler: "cargo check" };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Does the patched project still compile? Returns compiles=null when the check can't
 * be trusted: the ORIGINAL code doesn't compile here either (missing dependencies,
 * unsupported compiler), so a failure would say nothing about the fix.
 */
export async function checkPatch(
  chain: Chain,
  original: SourceFile[],
  patched: SourceFile[],
  entry: string,
): Promise<{ compiles: boolean | null; compiler: string; note?: string }> {
  try {
    if (chain === "soroban") {
      const before = await compileRust(original);
      if (!before) return { compiles: null, compiler: "cargo check", note: "Rust toolchain not installed; compile check skipped." };
      if (!before.ok) return { compiles: null, compiler: before.compiler, note: "The original project does not compile here, so the fix could not be checked." };
      const after = (await compileRust(patched))!;
      return { compiles: after.ok, compiler: after.compiler, note: after.ok ? undefined : after.errors };
    }
    const before = compileSolidity(original, entry);
    if (!before.ok) {
      return {
        compiles: null,
        compiler: before.compiler,
        note: `The original file does not compile here (often missing library imports), so the fix could not be checked. First error: ${before.errors.split("\n")[0]}`,
      };
    }
    const after = compileSolidity(patched, entry);
    return { compiles: after.ok, compiler: after.compiler, note: after.ok ? undefined : after.errors };
  } catch (e) {
    return { compiles: null, compiler: "solc-js", note: `Compile check failed to run: ${(e as Error).message}` };
  }
}
