import type { Chain, Finding, SourceFile } from "./types";

/**
 * A lightweight structural parser for the contract map and diff mode.
 * It works without Slither (which needs the project to compile), so the map is
 * always available. It's heuristic: it reads structure, it doesn't type-check.
 */

export type CallableBy = "anyone" | "restricted" | "weak" | "internal";

export interface MapFunction {
  id: string; // Contract.name
  name: string;
  contract: string;
  file: string;
  start: number;
  end: number;
  visibility: string;
  callableBy: CallableBy;
  guard?: string; // modifier or check that restricts callers
  payable: boolean;
  view: boolean;
  sendsEth: boolean;
  externalCall: boolean;
  delegatecall: boolean;
  selfdestruct: boolean;
  calls: string[]; // ids of functions called
  findings: string[]; // finding ids located in this function
  risky: boolean;
  riskReasons: string[];
}

export interface MapContract {
  name: string;
  file: string;
  kind: string;
  functions: MapFunction[];
}

/** Replace comments and string contents with spaces, keeping offsets and newlines. */
function blank(src: string, rust: boolean): string {
  const out = src.split("");
  let i = 0;
  const wipe = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const e = src.indexOf("\n", i);
      const end = e < 0 ? src.length : e;
      wipe(i, end);
      i = end;
    } else if (c === "/" && n === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? src.length : e + 2;
      wipe(i, end);
      i = end;
    } else if (c === '"' || (c === "'" && !rust)) {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      wipe(i + 1, j);
      i = j + 1;
    } else i++;
  }
  return out.join("");
}

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}" && --depth === 0) return i;
  }
  return s.length - 1;
}

function lineAt(starts: number[], idx: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= idx) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

const lineStarts = (s: string) => [0, ...[...s.matchAll(/\n/g)].map((m) => m.index! + 1)];

const SOL_WORDS = new Set([
  "public", "external", "internal", "private", "view", "pure", "payable", "virtual", "override", "returns", "nonpayable",
]);
const GUARD_RE = /^(only\w*|auth\w*|requiresAuth|restricted|whenOwner|ownerOnly|adminOnly)$/i;

/** Parse one Solidity file into contracts and functions. */
function parseSolidity(file: SourceFile): MapContract[] {
  const s = blank(file.content, false);
  const starts = lineStarts(s);
  const contracts: MapContract[] = [];
  const headRe = /\b(abstract\s+contract|contract|library|interface)\s+(\w+)[^{;]*\{/g;
  for (const m of s.matchAll(headRe)) {
    const open = m.index! + m[0].length - 1;
    const close = matchBrace(s, open);
    const body = s.slice(open + 1, close);
    const base = open + 1;
    const c: MapContract = { name: m[2], file: file.path, kind: m[1].replace(/\s+/g, " "), functions: [] };
    const fnRe = /\b(function\s+(\w+)|constructor|receive|fallback)\s*\(([^)]*)\)([^{;]*)([{;])/g;
    for (const f of body.matchAll(fnRe)) {
      // Only functions directly inside this contract (depth 0 of the body).
      const before = body.slice(0, f.index!);
      if ((before.match(/\{/g)?.length ?? 0) !== (before.match(/\}/g)?.length ?? 0)) continue;
      const name = f[2] ?? f[1];
      const attrs = f[4];
      const words: string[] = attrs.match(/\b\w+\b/g) ?? [];
      const visibility = words.find((w) => ["public", "external", "internal", "private"].includes(w)) ?? (name === "constructor" ? "constructor" : "public");
      const fStart = base + f.index!;
      const fEnd = f[5] === "{" ? matchBrace(s, base + f.index! + f[0].length - 1) : fStart + f[0].length;
      const code = s.slice(fStart, fEnd + 1);
      const modifiers = attrs
        .replace(/returns\s*\([^)]*\)/g, "")
        .match(/\b[A-Za-z_]\w*\b/g)
        ?.filter((w) => !SOL_WORDS.has(w)) ?? [];
      const guardMod = modifiers.find((w) => GUARD_RE.test(w));
      const senderCheck = /msg\.sender\s*(==|!=)|==\s*msg\.sender|_checkOwner\s*\(|_checkRole\s*\(|hasRole\s*\([^)]*msg\.sender|isOwner\s*\(/.test(code);
      const weak = /tx\.origin\s*(==|!=)|==\s*tx\.origin/.test(code);
      let callableBy: CallableBy = "anyone";
      let guard: string | undefined;
      if (visibility === "internal" || visibility === "private") callableBy = "internal";
      else if (name === "constructor") callableBy = "restricted";
      else if (guardMod || senderCheck) {
        callableBy = "restricted";
        guard = guardMod ?? "msg.sender check";
      } else if (weak) {
        callableBy = "weak";
        guard = "tx.origin check";
      }
      const transfers = [...code.matchAll(/\.(transfer|send)\s*\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)];
      c.functions.push({
        id: `${c.name}.${name}`,
        name,
        contract: c.name,
        file: file.path,
        start: lineAt(starts, fStart),
        end: lineAt(starts, fEnd),
        visibility,
        callableBy,
        guard,
        payable: words.includes("payable"),
        view: words.includes("view") || words.includes("pure"),
        // transfer/send with one argument is ETH; token.transfer(to, amount) has two.
        sendsEth: /\.call\s*\{[^}]*value\s*:/.test(code) || transfers.some((t) => !t[2].includes(",")),
        externalCall:
          /\.(call|staticcall)\s*[({]/.test(code) ||
          transfers.some((t) => t[2].includes(",")) ||
          /\b[A-Z]\w*\s*\([^()]*\)\s*\.\s*\w+\s*\(/.test(code),
        delegatecall: /\.delegatecall\s*\(/.test(code),
        selfdestruct: /\b(selfdestruct|suicide)\s*\(/.test(code),
        calls: [],
        findings: [],
        risky: false,
        riskReasons: [],
      });
    }
    contracts.push(c);
  }
  return contracts;
}

/** Parse Soroban contracts: functions inside `impl` blocks. */
function parseRust(file: SourceFile): MapContract[] {
  const s = blank(file.content, true);
  const starts = lineStarts(s);
  const contracts: MapContract[] = [];
  for (const m of s.matchAll(/(#\[contractimpl\]\s*)?impl(?:<[^>]*>)?\s+(?:\w+\s+for\s+)?(\w+)\s*\{/g)) {
    const open = m.index! + m[0].length - 1;
    const close = matchBrace(s, open);
    const body = s.slice(open + 1, close);
    const base = open + 1;
    const isContract = !!m[1];
    const c: MapContract = { name: m[2], file: file.path, kind: isContract ? "contractimpl" : "impl", functions: [] };
    for (const f of body.matchAll(/\b(pub(?:\([^)]*\))?\s+)?fn\s+(\w+)[^{;]*\{/g)) {
      const fStart = base + f.index!;
      const fEnd = matchBrace(s, base + f.index! + f[0].length - 1);
      const code = s.slice(fStart, fEnd + 1);
      const pub = !!f[1] && isContract;
      const auth = /\.require_auth(_for_args)?\s*\(/.test(code);
      c.functions.push({
        id: `${c.name}.${f[2]}`,
        name: f[2],
        contract: c.name,
        file: file.path,
        start: lineAt(starts, fStart),
        end: lineAt(starts, fEnd),
        visibility: pub ? "pub" : "private",
        callableBy: !pub ? "internal" : auth ? "restricted" : "anyone",
        guard: auth ? "require_auth()" : undefined,
        payable: false,
        view: !/\.storage\(\)\s*\.\s*\w+\(\)\s*\.\s*(set|remove|extend_ttl)\s*\(/.test(code),
        sendsEth: /\.transfer(_from)?\s*\(/.test(code),
        externalCall: /Client::new\s*\(|invoke_contract\s*\(/.test(code),
        delegatecall: false,
        selfdestruct: false,
        calls: [],
        findings: [],
        risky: false,
        riskReasons: [],
      });
    }
    if (c.functions.length) contracts.push(c);
  }
  return contracts;
}

/** All functions with their line ranges (used by diff mode). */
export function extractFunctions(file: SourceFile): MapFunction[] {
  return (file.path.endsWith(".rs") ? parseRust(file) : parseSolidity(file)).flatMap((c) => c.functions);
}

const OWNER_WRITE = /\b(owner|_owner|admin|governance|implementation)\s*=[^=]/;

/** Build the full map, resolve internal call edges and mark risky functions. */
export function buildContractMap(files: SourceFile[], findings: Finding[], chain: Chain): MapContract[] {
  const contracts = files.flatMap((f) => (chain === "soroban" ? parseRust(f) : parseSolidity(f)));
  const all = contracts.flatMap((c) => c.functions);
  const byName = new Map<string, MapFunction[]>();
  for (const f of all) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);

  for (const f of all) {
    const file = files.find((x) => x.path === f.file)!;
    const code = blank(file.content, chain === "soroban").split("\n").slice(f.start - 1, f.end).join("\n");
    const body = code.slice(code.indexOf("{") + 1);
    for (const m of body.matchAll(/(?<![.\w])(?:Self::|self\.)?(\w+)\s*\(/g)) {
      const targets = byName.get(m[1]);
      if (!targets) continue;
      const t = targets.find((x) => x.contract === f.contract) ?? targets[0];
      if (t !== f && !f.calls.includes(t.id)) f.calls.push(t.id);
    }

    f.findings = findings
      .filter((x) => x.status !== "false_positive" && x.file_name === f.file && x.line >= f.start && x.line <= f.end)
      .map((x) => x.id);
    const severe = findings.filter((x) => f.findings.includes(x.id) && (x.severity === "critical" || x.severity === "high"));
    const open = f.callableBy === "anyone";
    if (severe.length) f.riskReasons.push(`${severe.length} high/critical finding(s)`);
    if (f.callableBy === "weak") f.riskReasons.push("authorised with tx.origin");
    if (open && f.delegatecall) f.riskReasons.push("anyone can trigger delegatecall");
    if (open && f.selfdestruct) f.riskReasons.push("anyone can selfdestruct");
    // Paying msg.sender is the normal withdraw pattern; paying any other address is not.
    const paysCaller = /msg\.sender\s*\.\s*(call|transfer|send)\b|payable\s*\(\s*msg\.sender\s*\)/.test(code);
    if (open && f.sendsEth && !paysCaller) f.riskReasons.push(`anyone can send ${chain === "soroban" ? "tokens" : "ETH"} to any address`);
    if (open && chain === "solidity" && OWNER_WRITE.test(code.slice(code.indexOf("{"))))
      f.riskReasons.push("anyone can change a privileged variable");
    if (open && chain === "soroban" && /\.set\s*\(\s*&\s*\w+::(Admin|Owner)\b/i.test(code))
      f.riskReasons.push("anyone can change the admin");
    f.risky = f.riskReasons.length > 0;
  }
  return contracts;
}
