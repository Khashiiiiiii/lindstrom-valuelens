// The model client: a thin `chat` over Ollama /api/chat with local Qwen3 4B (Spec: AI assistant #39). The runners
// take a `Chat`, so tests pass a scripted fake instead.

import { AssistantFailureError } from "./errors.ts";

export const OLLAMA_URL = "http://127.0.0.1:11434";
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
export function ollamaChat(baseUrl: string = OLLAMA_URL): Chat {
  return async (request, signal) => {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
