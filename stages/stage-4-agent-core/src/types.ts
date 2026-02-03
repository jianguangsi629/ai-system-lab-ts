/**
 * Stage 4 Agent Core types.
 * Task planning, multi-step execution, intermediate state, failure recovery, memory write-back.
 */

import type { ChatResult } from "../../stage-0-model-gateway/src/types.js";
import type { ContextEngine } from "../../stage-1-context-engine/src/index.js";
import type { OutputController } from "../../stage-2-output-control/src/index.js";
import type { ProcessingReport } from "../../stage-3-tool-system/src/types.js";
import type { ToolRegistry } from "../../stage-3-tool-system/src/index.js";

/** Status of a single agent run. */
export type AgentRunStatus = "running" | "completed" | "failed";

/** Snapshot of an agent run for persistence and recovery. */
export interface AgentRunState {
  /** Unique run id (generated when run starts). */
  runId: string;
  /** Session id from Context Engine. */
  sessionId: string;
  /** User goal / task text. */
  goal: string;
  status: AgentRunStatus;
  /** When the run started (ISO string). */
  startedAt: string;
  /** When the run finished (ISO string); set when status is completed or failed. */
  finishedAt?: string;
  /** Number of tool rounds executed so far. */
  toolRounds: number;
  /** Final reply from LLM (if completed with reply). */
  reply?: string;
  /** Last raw assistant content (e.g. when parse failed or max rounds reached). */
  lastRawContent?: string;
  /** Whether max tool rounds was reached (incomplete run). */
  maxRoundsReached?: boolean;
  /** Error message when status is failed. */
  error?: string;
}

/** Options for a single agent run. */
export interface AgentRunOptions {
  /** Max tool rounds (passed to tool loop). */
  maxToolRounds?: number;
  /** Temperature for chat. */
  temperature?: number;
  /** Max tokens per chat response. */
  maxTokens?: number;
  /** If true, after run write a short summary back to Context Engine (setSummary). */
  writeSummaryToMemory?: boolean;
  /** Called after each chat in the tool loop: runId, round, chat result, and how we processed it. */
  onAfterChat?: (
    runId: string,
    round: number,
    chatResult: ChatResult,
    processing: ProcessingReport
  ) => void;
}

/** Result of running the agent on a goal. */
export interface AgentRunResult {
  /** Whether the run completed with a final reply (no parse failure, no max rounds). */
  success: boolean;
  /** Run id for this execution (for state lookup / recovery). */
  runId: string;
  /** Final reply to the user (if any). */
  reply?: string;
  /** Number of tool rounds executed. */
  toolRounds: number;
  /** Whether the loop ended because max rounds was reached. */
  maxRoundsReached: boolean;
  /** Last raw assistant content when no final reply (e.g. parse failed). */
  lastRawContent?: string;
  /** Error message when run failed (e.g. exception). */
  error?: string;
  /** Snapshot of run state (for persistence / recovery). */
  state: AgentRunState;
}

/** Store for agent run states: persist and retrieve for recovery / audit. */
export interface AgentStateStore {
  get(runId: string): AgentRunState | undefined;
  set(state: AgentRunState): void;
  delete(runId: string): boolean;
  listBySession(sessionId: string): AgentRunState[];
}

/** Dependencies required to run the agent (Stage 0, 1, 2, 3). */
export interface AgentDeps {
  /** Stage 0: chat function. */
  chat: (request: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }) => Promise<ChatResult>;
  /** Stage 1: context engine. */
  contextEngine: ContextEngine;
  /** Stage 2: output controller for parsing tool decision. */
  outputController: OutputController;
  /** Stage 3: tool registry. */
  toolRegistry: ToolRegistry;
  /** Optional: state store for run snapshots and recovery. */
  stateStore?: AgentStateStore;
}
