/**
 * Prompt-based tool loop: LLM decides whether to call a tool; we parse, execute, inject result, repeat.
 * Uses Stage 0 Gateway, Stage 1 Context Engine, Stage 2 Output Controller.
 */

import type { ContextEngine } from "../../stage-1-context-engine/src/index.js";
import type { ChatResult } from "../../stage-0-model-gateway/src/types.js";
import type { OutputController } from "../../stage-2-output-control/src/types.js";
import type {
  ProcessingReport,
  ToolDecisionOutput,
  ToolLoopOptions,
  ToolRegistry,
} from "./types.js";
import { TOOL_DECISION_SCHEMA } from "./types.js";

/** Build system prompt that describes all tools and instructs LLM to respond with JSON tool decision. */
export function buildToolSystemPrompt(registry: ToolRegistry): string {
  const tools = registry.list();
  const toolDescriptions = tools
    .map((t) => {
      const params = t.parameters
        ? ` Parameters (JSON): ${JSON.stringify(t.parameters)}`
        : "";
      return `- ${t.name}: ${t.description}${params}`;
    })
    .join("\n");

  return `You are a helpful assistant with access to tools. When the user needs information that a tool can provide, respond with a JSON object only (no other text):
{ "tool": "<tool_name>", "arguments": { ... } }
Use the exact tool name and pass the required arguments. When you do NOT need to call any tool and can answer directly, respond with:
{ "tool": null, "reply": "<your reply to the user>" }

Available tools:
${toolDescriptions}

Always respond with exactly one JSON object. No markdown, no explanation outside the JSON.`;
}

/** Parse assistant content as tool decision; returns parsed output or null if parse failed. */
export function parseToolDecision(
  outputController: OutputController,
  content: string
):
  | { success: true; data: ToolDecisionOutput }
  | { success: false; errors: string[] } {
  const result = outputController.parseAndValidate<ToolDecisionOutput>(
    content,
    {
      schema: TOOL_DECISION_SCHEMA,
      stripMarkdownCodeBlock: true,
    }
  );
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.errors };
}

/** Execute one tool call and return a string description for injecting into context. */
export async function executeToolCall(
  registry: ToolRegistry,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    const output = await registry.execute(toolName, args ?? {});
    return typeof output === "string"
      ? output
      : JSON.stringify(output, null, 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Error: ${message}`;
  }
}

export interface ToolLoopDeps {
  /** Stage 0 gateway for chat. */
  chat: (request: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }) => Promise<ChatResult>;
  /** Stage 1 context engine. */
  contextEngine: ContextEngine;
  /** Stage 2 output controller for parsing tool decision JSON. */
  outputController: OutputController;
  /** Stage 3 tool registry. */
  toolRegistry: ToolRegistry;
}

export interface ToolLoopResult {
  /** Final reply to the user (if LLM ended with reply). */
  reply?: string;
  /** Number of tool rounds executed. */
  toolRounds: number;
  /** Last raw assistant content (if parsing failed on last round). */
  lastRawContent?: string;
  /** Whether the loop ended because max rounds was reached. */
  maxRoundsReached: boolean;
}

/**
 * Run prompt-based tool loop: add user message, then repeatedly chat -> parse -> execute tool -> inject -> chat
 * until LLM returns tool: null (final reply) or max rounds.
 */
export async function runToolLoop(
  deps: ToolLoopDeps,
  sessionId: string,
  userMessage: string,
  options: ToolLoopOptions = {}
): Promise<ToolLoopResult> {
  const maxRounds = options.maxToolRounds ?? 5;
  const temperature = options.temperature ?? 0.1;
  const maxTokens = options.maxTokens ?? 500;

  const systemPrompt = buildToolSystemPrompt(deps.toolRegistry);
  deps.contextEngine.addMessage(sessionId, {
    role: "system",
    content: systemPrompt,
  });
  deps.contextEngine.addMessage(sessionId, {
    role: "user",
    content: userMessage,
  });

  let toolRounds = 0;
  let lastRawContent: string | undefined;

  for (let round = 0; round < maxRounds; round++) {
    const messages = deps.contextEngine.getMessagesForRequest(sessionId, {
      includeSummaryAsSystem: false,
    });
    const chatResult = await deps.chat({
      messages,
      temperature,
      maxTokens,
    });
    lastRawContent = chatResult.content;

    // Persist assistant message so context includes it for next round if we inject tool result
    deps.contextEngine.addMessage(sessionId, {
      role: "assistant",
      content: chatResult.content,
    });

    const parsed = parseToolDecision(deps.outputController, chatResult.content);
    if (!parsed.success) {
      const processing: ProcessingReport = {
        kind: "parse_failed",
        errors: parsed.errors,
      };
      options.onAfterChat?.(round, chatResult, processing);
      return {
        reply: undefined,
        toolRounds,
        lastRawContent: chatResult.content,
        maxRoundsReached: false,
      };
    }

    const { data } = parsed;
    if (data.tool === null || data.tool === undefined) {
      const processing: ProcessingReport = {
        kind: "final_reply",
        reply: data.reply ?? "",
      };
      options.onAfterChat?.(round, chatResult, processing);
      return {
        reply: data.reply ?? "",
        toolRounds,
        maxRoundsReached: false,
      };
    }

    toolRounds++;
    const toolResult = await executeToolCall(
      deps.toolRegistry,
      data.tool,
      data.arguments ?? {}
    );
    const resultSnippet =
      typeof toolResult === "string"
        ? toolResult.slice(0, 200) + (toolResult.length > 200 ? "..." : "")
        : String(toolResult).slice(0, 200);
    const processing: ProcessingReport = {
      kind: "tool_call",
      tool: data.tool,
      args: data.arguments ?? {},
      resultSnippet,
    };
    options.onAfterChat?.(round, chatResult, processing);
    const injectMessage = `[Tool result for ${data.tool}]\n${toolResult}`;
    deps.contextEngine.addMessage(sessionId, {
      role: "user",
      content: injectMessage,
    });
  }

  return {
    reply: undefined,
    toolRounds,
    lastRawContent,
    maxRoundsReached: true,
  };
}
