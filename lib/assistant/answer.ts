// The Assistant answer runner (Spec: AI assistant #39): the model calls the read tools for up to MAX_ROUNDS rounds
// and MAX_CALLS calls, then writes the text. Each prompt stands alone, and nothing is kept between requests.

import type { AssistantRequest, AssistantAnswer } from "./contract.ts";
import { AssistantFailureError } from "./errors.ts";
import { answerSystem, MAX_CALLS, MAX_ROUNDS } from "./context.ts";
import type { Chat, ChatMessage } from "./ollama.ts";
import { buildTools, ToolError } from "./tools.ts";

export const WRITE_NOW = "No more tool calls. Write the answer now.";

export interface AnswerDeps {
  chat: Chat;
  signal: AbortSignal;
}

/** One Assistant answer for a validated request. Throws AssistantFailureError. */
export async function answerPrompt(request: AssistantRequest, { chat, signal }: AnswerDeps): Promise<AssistantAnswer> {
  const tools = buildTools(request);
  const messages: ChatMessage[] = [
    { role: "system", content: answerSystem(request) },
    { role: "user", content: request.prompt },
  ];
  let calls = 0;
  for (let round = 0; ; round++) {
    const final = round >= MAX_ROUNDS || calls >= MAX_CALLS;
    if (final) messages.push({ role: "user", content: WRITE_NOW });
    const reply = await chat({ messages, ...(final ? {} : { tools: tools.definitions }) }, signal);
    const uses = final ? [] : (reply.message.tool_calls ?? []).slice(0, MAX_CALLS - calls);
    if (uses.length === 0) {
      const answer = stripThinking(reply.message.content ?? "");
      if (!answer) throw new AssistantFailureError("model_error", `The model returned no answer (done_reason ${reply.done_reason ?? "unknown"}).`);
      return { answer, sources: tools.state.sources, signal_groups: [], priority_change: null, unmatched_numbers: [] };
    }
    // Calls past the limit are dropped, also from the history, so every call kept has its result.
    messages.push({ ...reply.message, tool_calls: uses });
    for (const use of uses) {
      calls++;
      let content: string;
      try {
        content = JSON.stringify(tools.run(use.function.name, use.function.arguments));
      } catch (e) {
        if (!(e instanceof ToolError)) throw e;
        content = `Error: ${e.message}`;
      }
      messages.push({ role: "tool", tool_name: use.function.name, content });
    }
  }
}

export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "").trim();
}
