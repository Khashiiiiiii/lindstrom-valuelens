// The model client: a thin `chat` over Ollama /api/chat with local Qwen3 4B (Spec: AI assistant #39). The runners
// take a `Chat`, so tests pass a scripted fake instead. The GPU guard (#44) reads /api/ps after a model call.

import { AssistantFailureError } from "./errors.ts";

/** OLLAMA_URL overrides it, e.g. a tunnel to a GPU machine when the app is deployed. */
export const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "");

/**
 * Extra headers sent with every Ollama request, from OLLAMA_HEADERS as a JSON object of strings, e.g. the shared
 * secret a tunnel checks. Malformed JSON throws at startup, so a bad deploy fails loudly instead of sending no secret.
 */
export function ollamaHeaders(raw: string | undefined = process.env.OLLAMA_HEADERS): Record<string, string> {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || Object.values(parsed).some((v) => typeof v !== "string")) {
    throw new Error("OLLAMA_HEADERS must be a JSON object of string values.");
  }
  return parsed as Record<string, string>;
}
export const MODEL = "qwen3:4b-q8_0";
export const NUM_CTX = 16384;
export const TEMPERATURE = 0.3;

export interface ToolCall {
  function: { name: string; arguments: unknown };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
}

export interface ChatTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Left out for a request that must end in text. */
  tools?: ChatTool[];
  /** A JSON schema for structured output. */
  format?: Record<string, unknown>;
}

export interface ChatReply {
  message: ChatMessage;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

/** One model request. Throws AssistantFailureError: model_unavailable, timeout or model_error. */
export type Chat = (request: ChatRequest, signal: AbortSignal) => Promise<ChatReply>;

/** A Chat against a running Ollama. */
export function ollamaChat(baseUrl: string = OLLAMA_URL, extraHeaders: Record<string, string> = ollamaHeaders()): Chat {
  return async (request, signal) => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { ...extraHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          stream: false,
          think: false,
          options: { num_ctx: NUM_CTX, temperature: TEMPERATURE },
          ...request,
        }),
        signal,
      });
    } catch (e) {
      if (signal.aborted) throw new AssistantFailureError("timeout", "The model took too long to answer.");
      throw new AssistantFailureError("model_unavailable", `Ollama is not reachable at ${baseUrl}. Start it with "ollama serve". (${causeOf(e)})`);
    }
    let text: string;
    try {
      text = await res.text();
    } catch (e) {
      if (signal.aborted) throw new AssistantFailureError("timeout", "The model took too long to answer.");
      throw new AssistantFailureError("model_error", `Ollama's reply could not be read. (${causeOf(e)})`);
    }
    if (res.status === 404 || /model .*not found/i.test(text)) {
      throw new AssistantFailureError("model_unavailable", `The model ${MODEL} is not pulled. Run "ollama pull ${MODEL}".`);
    }
    if (!res.ok) throw new AssistantFailureError("model_error", `Ollama returned ${res.status}: ${text.slice(0, 200)}`);
    try {
      return JSON.parse(text) as ChatReply;
    } catch {
      throw new AssistantFailureError("model_error", "Ollama returned a reply that is not JSON.");
    }
  };
}

function causeOf(e: unknown): string {
  const cause = (e as { cause?: { code?: string; message?: string } }).cause;
  return cause?.code ?? cause?.message ?? (e as Error).message;
}

/** Checks where the model runs after a model call. Never throws. */
export type GpuCheck = () => Promise<void>;

const PS_TIMEOUT_MS = 2000;

/**
 * A GpuCheck against a running Ollama: reads /api/ps and logs a warning when part of MODEL is on the CPU
 * (size_vram below size), which makes answers several times slower. A model that is not loaded, or an /api/ps that
 * fails, logs nothing, since the model call already reports an Ollama that is down.
 */
export function ollamaGpuCheck(baseUrl: string = OLLAMA_URL, extraHeaders: Record<string, string> = ollamaHeaders()): GpuCheck {
  return async () => {
    let models: unknown;
    try {
      const res = await fetch(`${baseUrl}/api/ps`, { headers: extraHeaders, signal: AbortSignal.timeout(PS_TIMEOUT_MS) });
      models = ((await res.json()) as { models?: unknown } | null)?.models;
    } catch {
      return;
    }
    if (!Array.isArray(models)) return;
    const loaded = models.find((m) => m?.name === MODEL || m?.model === MODEL) as { size?: unknown; size_vram?: unknown } | undefined;
    if (typeof loaded?.size !== "number" || typeof loaded.size_vram !== "number" || loaded.size_vram >= loaded.size) return;
    const share = Math.floor((loaded.size_vram / loaded.size) * 100);
    console.warn(
      `assistant: ${MODEL} is only ${share}% on the GPU, the rest is on the CPU, so answers are slow. ` +
        `Restart Ollama with OLLAMA_FLASH_ATTENTION=1 and OLLAMA_KV_CACHE_TYPE=q8_0 and check that "ollama ps" shows 100% GPU.`,
    );
  };
}
