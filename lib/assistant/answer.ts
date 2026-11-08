// The Assistant answer runner (Spec: AI assistant #39): the model calls the read tools for up to MAX_ROUNDS rounds
// and MAX_CALLS calls, then writes the text. The server checks the text and sends its problems back once (#41). Each
// prompt stands alone, and nothing is kept between requests.

import type { CheckState } from "./checks.ts";
import { answerProblems, namedSignalGroups, unmatchedNumbers } from "./checks.ts";
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
      const first = stripThinking(reply.message.content ?? "");
      if (!first) throw new AssistantFailureError("model_error", `The model returned no answer (done_reason ${reply.done_reason ?? "unknown"}).`);
      const answer = await retryOnce(first, messages, tools.state, { chat, signal });
      const { state } = tools;
      return {
        answer,
        sources: state.sources,
        signal_groups: namedSignalGroups(answer, state),
        priority_change: state.priority_change,
        unmatched_numbers: unmatchedNumbers(answer, state.sources, state.extra_numbers),
      };
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

/**
 * When the text has problems, sends them back once and asks for the whole answer again, with no tools. What is
 * still wrong after it is flagged to the dashboard, not retried. An empty retry keeps the first text.
 */
async function retryOnce(text: string, messages: ChatMessage[], state: CheckState, { chat, signal }: AnswerDeps): Promise<string> {
  const problems = answerProblems(text, state);
  if (problems.length === 0) return text;
  const retry: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: text },
    { role: "user", content: retryPrompt(problems) },
  ];
  const again = await chat({ messages: retry }, signal);
  return stripThinking(again.message.content ?? "") || text;
}

function retryPrompt(problems: string[]): string {
  return `Your answer breaks these rules:\n${problems.map((p) => `- ${p}`).join("\n")}\nWrite the whole answer again, using only the tool results above. Do not mention this check.`;
}

export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*?<\/think>/, "").trim();
}
