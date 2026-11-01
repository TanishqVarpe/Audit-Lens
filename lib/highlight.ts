/** Tiny line-by-line syntax highlighter for Solidity and Rust (no dependency, good enough for review). */

export type TokenKind = "kw" | "type" | "str" | "num" | "com" | "fn" | "plain";
export interface Token {
  kind: TokenKind;
  text: string;
}
export type Lang = "solidity" | "rust";

const SOL_KW = new Set(
  "pragma solidity import contract interface library abstract is function modifier event error struct enum mapping returns return if else for while do break continue new delete emit revert require assert using constructor receive fallback memory storage calldata public external internal private view pure payable virtual override constant immutable unchecked try catch assembly let this super selfdestruct true false".split(" "),
);
const SOL_TYPE = /^(address|bool|string|bytes\d*|u?int\d*|fixed|ufixed)$/;
const RS_KW = new Set(
  "as break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while async await dyn".split(" "),
);
const RS_TYPE = /^(i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|usize|isize|bool|String|Vec|Option|Result|Env|Address|Symbol|Map|Bytes|BytesN)$/;

/**
 * Highlight one line. `inBlock` carries /* … *\/ comment state across lines,
 * so call it in order and pass the returned state to the next line.
 */
export function highlightLine(line: string, lang: Lang, inBlock: boolean): { tokens: Token[]; inBlock: boolean } {
  const tokens: Token[] = [];
  const push = (kind: TokenKind, text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind && kind === "plain") last.text += text;
    else tokens.push({ kind, text });
  };
  const kw = lang === "rust" ? RS_KW : SOL_KW;
  const type = lang === "rust" ? RS_TYPE : SOL_TYPE;
  let i = 0;

  if (inBlock) {
    const end = line.indexOf("*/");
    if (end < 0) return { tokens: [{ kind: "com", text: line }], inBlock: true };
    push("com", line.slice(0, end + 2));
    i = end + 2;
  }

  while (i < line.length) {
    const rest = line.slice(i);
    if (rest.startsWith("//")) {
      push("com", rest);
      break;
    }
    if (rest.startsWith("/*")) {
      const end = line.indexOf("*/", i + 2);
      if (end < 0) {
        push("com", rest);
        return { tokens, inBlock: true };
      }
      push("com", line.slice(i, end + 2));
      i = end + 2;
      continue;
    }
    const c = line[i];
    if (c === '"' || (c === "'" && lang === "solidity")) {
      let j = i + 1;
      while (j < line.length && line[j] !== c) j += line[j] === "\\" ? 2 : 1;
      push("str", line.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    const num = rest.match(/^(0x[0-9a-fA-F]+|\d[\d_]*(\.\d+)?(e\d+)?)/);
    if (num) {
      push("num", num[0]);
      i += num[0].length;
      continue;
    }
    const word = rest.match(/^[A-Za-z_$][\w$]*/);
    if (word) {
      const w = word[0];
      const next = line.slice(i + w.length).trimStart()[0];
      push(kw.has(w) ? "kw" : type.test(w) ? "type" : next === "(" || next === "!" ? "fn" : "plain", w);
      i += w.length;
      continue;
    }
    push("plain", c);
    i++;
  }
  return { tokens, inBlock: false };
}

export function highlightLines(src: string, lang: Lang): Token[][] {
  let inBlock = false;
  return src.split("\n").map((l) => {
    const r = highlightLine(l, lang, inBlock);
    inBlock = r.inBlock;
    return r.tokens;
  });
}

export const langOf = (path: string): Lang => (path.endsWith(".rs") ? "rust" : "solidity");

export const TOKEN_CLASS: Record<TokenKind, string> = {
  kw: "text-lavender-300",
  type: "text-sky-200",
  str: "text-[#d9b99b]",
  num: "text-orange-300",
  com: "text-mocha-500 italic",
  fn: "text-mocha-50",
  plain: "text-mocha-200",
};
