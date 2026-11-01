"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Hero3D } from "./Hero3D";
import { Reveal, Tilt } from "./Motion";

type Mode = "paste" | "zip" | "github" | "address" | "sample" | "sample-soroban";

const TABS: { id: Mode; label: string }[] = [
  { id: "paste", label: "Paste code" },
  { id: "zip", label: "Upload .zip" },
  { id: "github", label: "GitHub repo" },
  { id: "address", label: "Deployed contract" },
  { id: "sample", label: "Try sample" },
  { id: "sample-soroban", label: "Soroban sample" },
];

const CHAINS = [
  { id: 1, name: "Ethereum" },
  { id: 11155111, name: "Sepolia" },
  { id: 8453, name: "Base" },
  { id: 42161, name: "Arbitrum One" },
  { id: 10, name: "Optimism" },
  { id: 137, name: "Polygon" },
  { id: 56, name: "BNB Chain" },
];

const STEPS = ["Collecting contracts", "Running the analyzer", "Asking Gemma 4", "Verifying every claim", "Writing report"];

const PIPELINE = [
  ["01", "Detect", "Slither scans every contract. Its findings are ground truth, and the AI can't hide them."],
  ["02", "Explain", "Gemma 4 reads the whole codebase, ranks the findings, explains them and suggests fixes."],
  ["03", "Verify", "Code checks every quoted line, file and Slither claim. Anything unverifiable is removed."],
];

const FEATURES = [
  ["Code view", "Open the whole file with the problem line lit up and its neighbours shaded."],
  ["Fix it", "Gemma writes a patch, solc compiles it. “✓ compiles” only appears if it really does."],
  ["Re-audit & compare", "Apply fixes, run again: “High 2 → 0. Fixed: Reentrancy. New: none.”"],
  ["Risk grade", "One grade from A to F, plus a badge for your README."],
  ["Explain like I'm new", "A plain-words version of every finding, linked to its SWC entry."],
  ["Ask the code", "“Can anyone drain funds?” Every cited line is checked against the source."],
  ["Prove it", "Gemma writes a Foundry exploit test. Only a passing test says “Exploit confirmed”."],
  ["Contract map", "Who can call what, which functions move ETH, and which ones are risky."],
];

const MORE = ["GitHub PR bot", "Diff mode", "Deployed contracts", "Soroban", "Local mode (Ollama)", "Benchmark"];

export interface BenchTotals {
  labels: number;
  slither: { precision: number | null; recall: number | null };
  auditlens: { precision: number | null; recall: number | null };
}

const pct = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);

export function HomeClient({ bench }: { bench: BenchTotals | null }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("paste");
  const [code, setCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);

  function validate(): string {
    if (mode === "paste" && !code.trim()) return "Paste some Solidity code first.";
    if (mode === "zip" && !file) return "Choose a .zip file first.";
    if (mode === "github" && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/.test(url.trim()))
      return "Enter a GitHub URL like https://github.com/owner/repo";
    if (mode === "address" && !/^0x[0-9a-fA-F]{40}$/.test(address.trim())) return "Enter a contract address like 0x1234…abcd (40 hex characters).";
    return "";
  }

  async function submit() {
    const v = validate();
    if (v) return setError(v);
    setError("");
    setBusy(true);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500);
    try {
      const fd = new FormData();
      fd.set("mode", mode);
      if (mode === "paste") fd.set("code", code);
      if (mode === "zip" && file) fd.set("file", file);
      if (mode === "github") fd.set("url", url.trim());
      if (mode === "address") {
        fd.set("address", address.trim());
        fd.set("chain_id", String(chainId));
      }
      const res = await fetch("/api/audit", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Audit failed.");
      router.push(`/report/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed.");
      setBusy(false);
    } finally {
      clearInterval(timer);
    }
  }

  function goToPanel(m?: Mode) {
    if (m) {
      setMode(m);
      setError("");
    }
    panel.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const input =
    "w-full rounded-xl border border-mocha-700/70 bg-mocha-950/70 p-3 font-mono text-sm text-mocha-100 outline-none transition placeholder:text-mocha-600 focus:border-lavender-400/70 focus:shadow-[0_0_0_3px_rgba(196,181,236,0.12)]";

  return (
    <div className="space-y-28 pb-10">
      <Hero3D busy={busy} />

      {/* Hero */}
      <section className="relative flex min-h-[72vh] flex-col justify-center gap-7 pt-6">
        <div className="max-w-xl space-y-7">
          <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-lavender-400/30 bg-mocha-900/60 px-3 py-1 text-xs text-lavender-200 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-lavender-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-lavender-300" />
            </span>
            Slither · Gemma 4 · verified by code
          </p>
          <h1 className="animate-fade-up text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ animationDelay: "120ms" }}>
            <span className="text-platinum-sheen animate-shimmer">Audit smart contracts</span>
            <br />
            <span className="bg-gradient-to-r from-lavender-300 via-lavender-200 to-mocha-200 bg-clip-text text-transparent">without the noise.</span>
          </h1>
          <p className="animate-fade-up max-w-lg text-lg leading-relaxed text-mocha-300" style={{ animationDelay: "240ms" }}>
            Slither finds the issues, Gemma 4 ranks and explains them, and AuditLens checks every AI claim against your real source
            before it reaches the report.
          </p>
          <div className="animate-fade-up flex flex-wrap gap-3" style={{ animationDelay: "360ms" }}>
            <button
              onClick={() => goToPanel()}
              className="group relative overflow-hidden rounded-xl bg-lavender-300 px-6 py-3 text-sm font-semibold text-mocha-950 shadow-[0_10px_40px_-10px_rgba(196,181,236,0.7)] transition hover:-translate-y-0.5 hover:bg-lavender-200"
            >
              Start an audit
              <span className="ml-2 inline-block transition group-hover:translate-x-1">→</span>
            </button>
            <button
              onClick={() => goToPanel("sample")}
              className="rounded-xl border border-mocha-500/60 bg-mocha-900/50 px-6 py-3 text-sm font-semibold text-mocha-100 backdrop-blur transition hover:-translate-y-0.5 hover:border-mocha-300"
            >
              Try the sample
            </button>
          </div>
          {bench && (
            <dl className="animate-fade-up flex flex-wrap gap-x-8 gap-y-3 pt-2" style={{ animationDelay: "480ms" }}>
              {[
                [pct(bench.auditlens.recall), "recall on the benchmark"],
                [pct(bench.auditlens.precision), "precision"],
                [pct(bench.slither.recall), "recall with Slither alone"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="text-2xl font-semibold text-mocha-50">{v}</dt>
                  <dd className="text-xs text-mocha-400">{l}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <button
          onClick={() => goToPanel()}
          aria-label="Scroll to the audit panel"
          className="absolute bottom-0 left-1/2 hidden -translate-x-1/2 animate-bounce3d text-mocha-500 hover:text-mocha-200 sm:block"
        >
          <span className="text-2xl">⌄</span>
        </button>
      </section>

      {/* Audit panel */}
      <section id="audit" ref={panel} className="scroll-mt-24">
        <Reveal>
          <Tilt max={2.5} className="rounded-2xl">
            <div className="border-glow animate-border-spin rounded-2xl shadow-[0_40px_120px_-40px_rgba(196,181,236,0.35)]">
              <div className="flex flex-wrap gap-1 border-b border-mocha-700/60 p-2">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setMode(t.id);
                      setError("");
                    }}
                    disabled={busy}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${
                      mode === t.id
                        ? "bg-lavender-300/15 text-lavender-100 shadow-[inset_0_0_0_1px_rgba(196,181,236,0.35)]"
                        : "text-mocha-400 hover:bg-mocha-800/60 hover:text-mocha-100"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="p-5">
                {busy ? (
                  <Progress step={step} />
                ) : (
                  <>
                    {mode === "paste" && (
                      <textarea
                        value={code}
                        onChange={(e) => {
                          setCode(e.target.value);
                          setError("");
                        }}
                        placeholder={"// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract MyVault { ... }"}
                        spellCheck={false}
                        className={`${input} h-72 resize-y`}
                      />
                    )}
                    {mode === "zip" && (
                      <label className="flex h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-mocha-600 bg-mocha-950/50 text-sm text-mocha-400 transition hover:border-lavender-400/70 hover:text-mocha-200">
                        <input
                          type="file"
                          accept=".zip"
                          className="hidden"
                          onChange={(e) => {
                            setFile(e.target.files?.[0] ?? null);
                            setError("");
                          }}
                        />
                        {file ? <span className="text-mocha-100">{file.name}</span> : "Click to choose a .zip of your project (max 20 MB)"}
                        <span className="text-xs text-mocha-600">node_modules, lib, test and mocks folders are skipped</span>
                      </label>
                    )}
                    {mode === "github" && (
                      <input
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          setError("");
                        }}
                        placeholder="https://github.com/owner/repo"
                        className={input}
                      />
                    )}
                    {mode === "address" && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))} className={`${input} w-auto font-sans`}>
                            {CHAINS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <input
                            value={address}
                            onChange={(e) => {
                              setAddress(e.target.value);
                              setError("");
                            }}
                            placeholder="0x…"
                            className={`${input} flex-1`}
                          />
                        </div>
                        <p className="text-xs text-mocha-500">
                          Fetches the verified source from Sourcify (or Etherscan, if ETHERSCAN_API_KEY is set) and audits it. Check a
                          contract before you interact with it.
                        </p>
                      </div>
                    )}
                    {mode === "sample" && (
                      <p className="text-sm leading-relaxed text-mocha-300">
                        Runs on <code className="text-lavender-300">samples/VulnerableVault.sol</code>, a deliberately vulnerable
                        contract with reentrancy, tx.origin auth, missing access control, an unchecked send and an arbitrary
                        delegatecall.
                      </p>
                    )}
                    {mode === "sample-soroban" && (
                      <p className="text-sm leading-relaxed text-mocha-300">
                        Runs on <code className="text-lavender-300">samples/soroban-vault</code>, a deliberately vulnerable Soroban
                        (Stellar) contract in Rust with missing authorization, double initialisation and unchecked arithmetic. Uses Scout
                        if installed.
                      </p>
                    )}
                  </>
                )}

                {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

                <div className="mt-5 flex items-center gap-4">
                  <button
                    onClick={submit}
                    disabled={busy}
                    className="relative overflow-hidden rounded-xl bg-lavender-300 px-6 py-2.5 text-sm font-semibold text-mocha-950 shadow-[0_10px_30px_-10px_rgba(196,181,236,0.8)] transition hover:-translate-y-0.5 hover:bg-lavender-200 disabled:translate-y-0 disabled:opacity-70"
                  >
                    {busy ? "Auditing…" : "Run audit"}
                  </button>
                  <span className="text-xs text-mocha-500">Your code is sent to the configured LLM. Use local mode for private code.</span>
                </div>
              </div>
            </div>
          </Tilt>
        </Reveal>
      </section>

      {/* Pipeline */}
      <section className="space-y-8">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight text-mocha-50">Three layers. One trustworthy report.</h2>
        </Reveal>
        <div className="relative grid gap-5 sm:grid-cols-3">
          {/* Data flowing between the stages. */}
          <div aria-hidden className="absolute left-[16%] right-[16%] top-1/2 hidden h-px bg-gradient-to-r from-mocha-700 via-lavender-400/50 to-mocha-700 sm:block">
            <span className="absolute -top-1 h-2 w-2 animate-flow rounded-full bg-lavender-300 shadow-[0_0_12px_rgba(196,181,236,0.9)]" />
            <span className="absolute -top-1 h-2 w-2 animate-flow rounded-full bg-mocha-100 [animation-delay:1.4s]" />
          </div>
          {PIPELINE.map(([n, t, d], i) => (
            <Reveal key={t} delay={i * 140}>
              <div className="animate-float [perspective:800px]" style={{ animationDelay: `${i * 0.8}s` }}>
                <Tilt max={10} className="glass rounded-2xl p-6">
                  <div className="flex items-center gap-3">
                    <Cube />
                    <span className="font-mono text-xs text-lavender-300">{n}</span>
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-mocha-50">{t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mocha-300">{d}</p>
                </Tilt>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="space-y-8">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight text-mocha-50">
            Everything on the report page, <span className="text-lavender-300">checked by code</span>.
          </h2>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([t, d], i) => (
            <Reveal key={t} delay={(i % 4) * 90}>
              <Tilt max={12} className="glass group h-full rounded-2xl p-5 transition hover:border-lavender-400/50">
                <div className="mb-4 h-1 w-10 rounded-full bg-gradient-to-r from-lavender-300 to-mocha-300 transition-all duration-500 group-hover:w-20" />
                <h3 className="font-semibold text-mocha-50">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-mocha-400">{d}</p>
              </Tilt>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-mocha-500">Also:</span>
            {MORE.map((m) => (
              <span key={m} className="rounded-full border border-mocha-700 bg-mocha-900/60 px-3 py-1 text-xs text-mocha-300">
                {m}
              </span>
            ))}
          </div>
        </Reveal>
      </section>

      {/* Closing CTA */}
      <Reveal>
        <section className="glass relative overflow-hidden rounded-3xl p-10 text-center">
          <div aria-hidden className="absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-lavender-400/20 blur-3xl" />
          <h2 className="relative text-3xl font-semibold tracking-tight">
            <span className="text-platinum-sheen animate-shimmer">Tools find. Gemma explains. Code verifies.</span>
          </h2>
          <button
            onClick={() => goToPanel("sample")}
            className="relative mt-6 rounded-xl bg-lavender-300 px-6 py-3 text-sm font-semibold text-mocha-950 transition hover:-translate-y-0.5 hover:bg-lavender-200"
          >
            Audit the sample contract
          </button>
        </section>
      </Reveal>
    </div>
  );
}

/** Live progress while an audit runs (the 3D lens scans faster meanwhile). */
function Progress({ step }: { step: number }) {
  return (
    <ol className="space-y-3 py-4" aria-live="polite">
      {STEPS.map((s, i) => (
        <li key={s} className={`flex items-center gap-3 text-sm transition ${i > step ? "text-mocha-600" : "text-mocha-100"}`}>
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
              i < step
                ? "bg-lavender-300 text-mocha-950"
                : i === step
                  ? "relative bg-mocha-800 text-lavender-200 ring-1 ring-lavender-400"
                  : "bg-mocha-900 text-mocha-600 ring-1 ring-mocha-700"
            }`}
          >
            {i < step ? "✓" : i + 1}
            {i === step && <span className="absolute inset-0 animate-pulse-ring rounded-full ring-1 ring-lavender-300" />}
          </span>
          {s}
          {i === step && <span className="text-mocha-500">…</span>}
        </li>
      ))}
    </ol>
  );
}

/** Small CSS 3D cube that spins: a nod to blocks on a chain. */
function Cube() {
  const faces = [
    "rotateY(0deg)",
    "rotateY(90deg)",
    "rotateY(180deg)",
    "rotateY(-90deg)",
    "rotateX(90deg)",
    "rotateX(-90deg)",
  ];
  return (
    <span className="relative block h-7 w-7 [perspective:300px]" aria-hidden>
      <span className="absolute inset-0 animate-spin-3d [transform-style:preserve-3d]">
        {faces.map((f, i) => (
          <span
            key={f}
            className={`absolute inset-0 border ${i % 2 ? "border-lavender-300/70 bg-lavender-300/10" : "border-mocha-200/60 bg-mocha-300/10"}`}
            style={{ transform: `${f} translateZ(14px)` }}
          />
        ))}
      </span>
    </span>
  );
}
