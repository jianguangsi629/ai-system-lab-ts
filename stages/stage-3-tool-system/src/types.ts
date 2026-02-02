/**
 * Stage 3 Tool System types.
 * Defines Tool / Function abstraction, registry, and tool-call flow.
 */

import type { JsonSchema } from "../../stage-2-output-control/src/types.js";

/** Single tool: name, description, parameters schema, and execute function. */
export interface Tool<TArgs = unknown, TResult = unknown> {
  /** Unique tool name (used by LLM to decide which tool to call). */
  name: string;
  /** Human-readable description for the LLM. */
  description: string;
  /** JSON Schema for tool arguments (optional; if omitted, args are free-form). */
  parameters?: JsonSchema;
  /** Execute the tool with parsed arguments; return result (will be serialized for LLM). */
  execute(args: TArgs): Promise<TResult>;
}

/** One tool call request: name + arguments. */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** Result of executing a tool (stringified for injection into context). */
export interface ToolResult {
  toolName: string;
  success: boolean;
  output: unknown;
  error?: string;
}

/**
 * Structured output when using prompt-based tool decision: LLM returns either
 * a tool call or a final reply (no tool).
 */
export interface ToolDecisionOutput {
  /** If non-null, LLM wants to call this tool with the given arguments. */
  tool: string | null;
  /** Required when tool is set; must match the tool's parameters schema. */
  arguments?: Record<string, unknown>;
  /** When tool is null, optional final reply to the user. */
  reply?: string;
}

/** JSON Schema for parsing/validating LLM tool-decision output (Stage 2). */
export const TOOL_DECISION_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    tool: {
      type: ["string", "null"],
      description: "Tool name to call, or null for no call",
    },
    arguments: {
      type: "object",
      additionalProperties: true,
      description: "Arguments for the tool call",
    },
    reply: {
      type: "string",
      description: "Final reply when not calling a tool",
    },
  },
  required: ["tool"],
  additionalProperties: false,
};

/** Tool registry: register tools by name, list for API/prompt, execute by name. */
export interface ToolRegistry {
  /** Register a tool; overwrites if name already exists. */
  register(tool: Tool): void;
  /** Get tool by name. */
  get(name: string): Tool | undefined;
  /** List all registered tools (for building prompt or API tools array). */
  list(): Tool[];
  /** Execute a tool by name with given arguments; returns result or throws. */
  execute(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/** Options for the prompt-based tool loop. */
export interface ToolLoopOptions {
  /** Max rounds of: LLM -> parse -> execute tool -> inject result -> LLM again. */
  maxToolRounds?: number;
  /** Temperature for chat (default 0.1 for more deterministic tool choice). */
  temperature?: number;
  /** Max tokens per chat response. */
  maxTokens?: number;
}
