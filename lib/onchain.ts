import { writeSources } from "./ingest";
import type { SourceFile } from "./types";

export const CHAINS: { id: number; name: string; explorer: string }[] = [
  { id: 1, name: "Ethereum", explorer: "https://etherscan.io/address/" },
  { id: 11155111, name: "Sepolia", explorer: "https://sepolia.etherscan.io/address/" },
  { id: 8453, name: "Base", explorer: "https://basescan.org/address/" },
  { id: 42161, name: "Arbitrum One", explorer: "https://arbiscan.io/address/" },
  { id: 10, name: "Optimism", explorer: "https://optimistic.etherscan.io/address/" },
  { id: 137, name: "Polygon", explorer: "https://polygonscan.com/address/" },
  { id: 56, name: "BNB Chain", explorer: "https://bscscan.com/address/" },
];

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const UA = { "User-Agent": "auditlens (smart contract auditor)" };

/** Keep source paths inside the temp dir: drop drive letters, leading slashes and "..". */
function safePath(p: string): string {
  return p
    .replace(/\\/g, "/")
    .replace(/^[a-zA-Z]:/, "")
    .split("/")
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
}

async function fromSourcify(chainId: number, address: string): Promise<{ files: SourceFile[]; name?: string } | null> {
  const res = await fetch(`https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=sources,compilation`, { headers: UA });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Sourcify error ${res.status}`);
  const data = (await res.json()) as { sources?: Record<string, { content?: string }>; compilation?: { name?: string } };
  const files = Object.entries(data.sources ?? {})
    .filter(([, v]) => typeof v?.content === "string")
    .map(([p, v]) => ({ path: safePath(p), content: v.content! }));
  return files.length ? { files, name: data.compilation?.name } : null;
}

async function fromEtherscan(chainId: number, address: string, key: string): Promise<{ files: SourceFile[]; name: string } | null> {
  const url = `https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Etherscan error ${res.status}`);
  const data = await res.json();
  const r = Array.isArray(data.result) ? data.result[0] : null;
  const src = String(r?.SourceCode ?? "").trim();
  if (!src) return null;
  const name = String(r.ContractName || "Contract");

  // Multi-file contracts come as standard JSON input, sometimes wrapped in double braces.
  if (src.startsWith("{")) {
    try {
      const json = JSON.parse(src.startsWith("{{") ? src.slice(1, -1) : src);
      const sources: Record<string, { content?: string }> = json.sources ?? json;
      const files = Object.entries(sources)
        .filter(([, v]) => typeof v?.content === "string")
        .map(([p, v]) => ({ path: safePath(p), content: v.content! }));
      if (files.length) return { files, name };
    } catch {
      // fall through: treat as a single file
    }
  }
  return { files: [{ path: `${name}.sol`, content: src }], name };
}

/**
 * Fetch the verified source of a deployed contract into dest.
 * Sourcify needs no key; Etherscan is used as a fallback when ETHERSCAN_API_KEY is set.
 */
export async function fetchDeployed(chainId: number, address: string, dest: string): Promise<{ name: string; origin: string }> {
  address = address.trim();
  if (!ADDRESS_RE.test(address)) throw new Error("Enter a contract address like 0x1234…abcd (40 hex characters).");
  const chain = CHAINS.find((c) => c.id === chainId);
  if (!chain) throw new Error("Unsupported chain.");

  let files: SourceFile[] | null = null;
  let name = `${chain.name} ${address.slice(0, 6)}…${address.slice(-4)}`;
  let via = "Sourcify";
  try {
    const r = await fromSourcify(chainId, address);
    if (r) {
      files = r.files;
      if (r.name) name = `${r.name} (${name})`;
    }
  } catch (e) {
    console.warn("[onchain] Sourcify failed:", (e as Error).message);
  }
  const key = process.env.ETHERSCAN_API_KEY;
  if (!files && key) {
    const r = await fromEtherscan(chainId, address, key);
    if (r) {
      files = r.files;
      name = `${r.name} (${name})`;
      via = "Etherscan";
    }
  }
  if (!files) {
    throw new Error(
      `No verified source found for ${address} on ${chain.name}${key ? "" : " via Sourcify. Set ETHERSCAN_API_KEY to also check Etherscan"}.`,
    );
  }
  const sol = files.filter((f) => f.path.endsWith(".sol"));
  if (!sol.length) throw new Error("The verified source has no Solidity files (Vyper is not supported).");
  await writeSources(sol, dest);
  return { name, origin: `${chain.name} ${address} (source: ${via})` };
}
