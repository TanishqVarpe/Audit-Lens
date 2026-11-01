import { SYSTEM_PROMPT, SOROBAN_SYSTEM_PROMPT, userPrompt } from "./prompt";
import type { Chain } from "./types";

export interface LlmConfig {
  provider: "openai" | "ollama";
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Ollama only: context window to request (its default is far too small). */
  numCtx?: number;
  /**
   * OpenAI-compatible only. false sends chat_template_kwargs.enable_thinking=false (vLLM).
   * Gemma 4 with thinking on often reasons until max_tokens and never answers.
   * undefined = don't send the option (provider rejected it).
   */
  thinking?: boolean;
}

/**
 * LLM_PROVIDER=ollama runs Gemma locally, so code never leaves the machine.
 * Otherwise any OpenAI-compatible host (Jarvis AI etc.) via JARVIS_* variables.
 */
export function llmConfig(): LlmConfig | null {
  if (process.env.MOCK_LLM === "true") return null;
  if (process.env.LLM_PROVIDER === "ollama") {
    return {
      provider: "ollama",
      apiKey: "",
      baseUrl: (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/+$/, ""),
      model: process.env.OLLAMA_MODEL || "gemma4",
      numCtx: Number(process.env.OLLAMA_NUM_CTX) || 32_768,
    };
  }
  const apiKey = process.env.JARVIS_API_KEY;
  const baseUrl = process.env.JARVIS_BASE_URL;
  // Placeholders from .env.example count as "not configured".
  if (!apiKey || !baseUrl || apiKey === "your_key_here" || baseUrl.includes("your-jarvis-endpoint")) return null;
  return {
    provider: "openai",
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model: process.env.GEMMA_MODEL || "gemma-4-31b",
    thinking: process.env.LLM_THINKING === "true",
  };
}

/** Token budget for the code context. Local models get a smaller default. */
export function contextBudget(cfg: LlmConfig | null): number {
  const set = Number(process.env.MAX_CONTEXT_TOKENS);
  if (cfg?.provider === "ollama") return Math.min(set || Infinity, (cfg.numCtx ?? 32_768) - 6_000);
  return set || 100_000;
}

export type Msg = { role: "system" | "user" | "assistant"; content: string };

async function chat(cfg: LlmConfig, messages: Msg[], jsonMode: boolean): Promise<string> {
  const timeoutMs = cfg.provider === "ollama" ? 600_000 : 180_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const ollama = cfg.provider === "ollama";
    const res = await fetch(ollama ? `${cfg.baseUrl}/api/chat` : `${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(ollama ? {} : { Authorization: `Bearer ${cfg.apiKey}` }) },
      body: JSON.stringify(
        ollama
          ? { model: cfg.model, messages, stream: false, ...(jsonMode ? { format: "json" } : {}), options: { temperature: 0.1, num_ctx: cfg.numCtx } }
          : {
              model: cfg.model,
              messages,
              temperature: 0.1,
              // Reasoning models spend output tokens thinking first; leave room for the JSON.
              max_tokens: Number(process.env.LLM_MAX_TOKENS) || 16_384,
              ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
              ...(cfg.thinking === false ? { chat_template_kwargs: { enable_thinking: false } } : {}),
            },
      ),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      const err = new Error(`LLM API error ${res.status}: ${body}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const content = String((ollama ? data.message?.content : data.choices?.[0]?.message?.content) ?? "");
    if (!content.trim() && (ollama ? data.done_reason : data.choices?.[0]?.finish_reason) === "length") {
      throw new Error(
        "The model used all its output tokens before answering (it was still reasoning). Raise LLM_MAX_TOKENS, or leave LLM_THINKING off.",
      );
    }
    return content;
  } catch (e: unknown) {
    if ((e as Error).name === "AbortError") throw new Error(`LLM API timed out after ${timeoutMs / 1000}s.`);
    if ((e as Error).message === "fetch failed") {
      if (cfg.provider === "ollama") {
        throw new Error(`Could not reach Ollama at ${cfg.baseUrl}. Is "ollama serve" running and "${cfg.model}" pulled?`);
      }
      const code = ((e as Error).cause as { code?: string } | undefined)?.code ?? "network error";
      throw new Error(`Could not reach the LLM at ${new URL(cfg.baseUrl).host} (${code}). Check JARVIS_BASE_URL in .env.`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Pull a JSON object out of a model reply (handles ```json fences and stray text). */
export function parseJsonObject(text: string): Record<string, unknown> {
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  const obj = JSON.parse(t);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("Reply is not a JSON object.");
  return obj;
}

export function parseJsonReply(text: string): { findings: unknown[] } {
  const obj = parseJsonObject(text);
  if (!Array.isArray(obj.findings)) throw new Error('Reply JSON has no "findings" array.');
  return obj as { findings: unknown[] };
}

/**
 * Call the model and parse its JSON reply. Falls back to plain mode if the provider
 * rejects JSON mode, and retries once with the parse error fed back.
 */
export async function chatJson<T>(cfg: LlmConfig, messages: Msg[], parse: (text: string) => T): Promise<T> {
  let jsonMode = true;
  let reply: string;
  try {
    reply = await chat(cfg, messages, jsonMode);
  } catch (e: unknown) {
    // Some providers reject response_format or chat_template_kwargs; retry without both.
    if ((e as { status?: number }).status === 400) {
      jsonMode = false;
      cfg = { ...cfg, thinking: undefined };
      reply = await chat(cfg, messages, jsonMode);
    } else throw e;
  }

  try {
    return parse(reply);
  } catch (e: unknown) {
    const retry: Msg[] = [
      ...messages,
      { role: "assistant", content: reply },
      {
        role: "user",
        content: `Your reply was not valid (${(e as Error).message}). Reply again with ONLY the JSON object in the required format.`,
      },
    ];
    return parse(await chat(cfg, retry, jsonMode));
  }
}

/** Ask Gemma 4 to triage findings. */
export async function askGemma(cfg: LlmConfig, context: string, chain: Chain = "solidity", focusNote = ""): Promise<unknown[]> {
  const messages: Msg[] = [
    { role: "system", content: chain === "soroban" ? SOROBAN_SYSTEM_PROMPT : SYSTEM_PROMPT },
    { role: "user", content: userPrompt(context, focusNote) },
  ];
  return chatJson(cfg, messages, (t) => parseJsonReply(t).findings);
}
