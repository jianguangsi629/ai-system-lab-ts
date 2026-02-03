/**
 * Agent Core: orchestrate task (goal) through tool loop, persist state, optional memory write-back.
 * Uses Stage 0 Gateway, Stage 1 Context Engine, Stage 2 Output Controller, Stage 3 Tool System.
 */

import { runToolLoop } from "../../stage-3-tool-system/src/runner.js";
import type {
  AgentDeps,
  AgentRunOptions,
  AgentRunResult,
  AgentRunState,
  AgentRunStatus,
} from "./types.js";
import type { ChatResult } from "../../stage-0-model-gateway/src/types.js";
import type { ProcessingReport } from "../../stage-3-tool-system/src/types.js";

function generateRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Build run state snapshot from tool loop result and goal. */
function toRunState(
  runId: string,
  sessionId: string,
  goal: string,
  status: AgentRunStatus,
  startedAt: string,
  opts: {
    toolRounds: number;
    reply?: string;
    lastRawContent?: string;
    maxRoundsReached: boolean;
    error?: string;
  }
): AgentRunState {
  const finishedAt = status !== "running" ? nowIso() : undefined;
  return {
    runId,
    sessionId,
    goal,
    status,
    startedAt,
    finishedAt,
    toolRounds: opts.toolRounds,
    reply: opts.reply,
    lastRawContent: opts.lastRawContent,
    maxRoundsReached: opts.maxRoundsReached,
    error: opts.error,
  };
}

/** Write a short summary of the run back to Context Engine (memory write-back). */
function writeSummaryToMemory(
  contextEngine: AgentDeps["contextEngine"],
  sessionId: string,
  goal: string,
  reply: string | undefined,
  toolRounds: number
): void {
  const replySnippet =
    reply !== undefined
      ? reply.slice(0, 200) + (reply.length > 200 ? "..." : "")
      : "no final reply";
  const summary = `Last agent run: goal="${goal.slice(0, 100)}${
    goal.length > 100 ? "..." : ""
  }"; reply="${replySnippet}"; tool rounds=${toolRounds}.`;
  contextEngine.setSummary(sessionId, summary);
}

/**
 * Run the agent on a goal: inject goal as user message, run tool loop, optionally persist state and write summary to memory.
 */
export async function runAgent(
  deps: AgentDeps,
  sessionId: string,
  goal: string,
  options: AgentRunOptions = {}
): Promise<AgentRunResult> {
  const runId = generateRunId();
  const startedAt = nowIso();
  const maxToolRounds = options.maxToolRounds ?? 5;
  const temperature = options.temperature ?? 0.1;
  const maxTokens = options.maxTokens ?? 500;
  const writeSummaryToMemoryOpt = options.writeSummaryToMemory ?? false;

  const toolLoopDeps = {
    chat: deps.chat,
    contextEngine: deps.contextEngine,
    outputController: deps.outputController,
    toolRegistry: deps.toolRegistry,
  };

  const initialState: AgentRunState = toRunState(
    runId,
    sessionId,
    goal,
    "running",
    startedAt,
    { toolRounds: 0, maxRoundsReached: false }
  );
  deps.stateStore?.set(initialState);

  const toolLoopOptions = {
    maxToolRounds,
    temperature,
    maxTokens,
    onAfterChat: options.onAfterChat
      ? (round: number, chatResult: ChatResult, processing: ProcessingReport) =>
          options.onAfterChat!(runId, round, chatResult, processing)
      : undefined,
  };

  try {
    const loopResult = await runToolLoop(
      toolLoopDeps,
      sessionId,
      goal,
      toolLoopOptions
    );

    const success =
      loopResult.reply !== undefined &&
      !loopResult.maxRoundsReached &&
      (loopResult.lastRawContent === undefined || loopResult.reply.length > 0);

    const state: AgentRunState = toRunState(
      runId,
      sessionId,
      goal,
      success ? "completed" : "completed",
      startedAt,
      {
        toolRounds: loopResult.toolRounds,
        reply: loopResult.reply,
        lastRawContent: loopResult.lastRawContent,
        maxRoundsReached: loopResult.maxRoundsReached,
      }
    );
    deps.stateStore?.set(state);

    if (writeSummaryToMemoryOpt) {
      writeSummaryToMemory(
        deps.contextEngine,
        sessionId,
        goal,
        loopResult.reply,
        loopResult.toolRounds
      );
    }

    return {
      success,
      runId,
      reply: loopResult.reply,
      toolRounds: loopResult.toolRounds,
      maxRoundsReached: loopResult.maxRoundsReached,
      lastRawContent: loopResult.lastRawContent,
      state,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const state: AgentRunState = toRunState(
      runId,
      sessionId,
      goal,
      "failed",
      startedAt,
      {
        toolRounds: 0,
        maxRoundsReached: false,
        error: errorMessage,
      }
    );
    deps.stateStore?.set(state);

    return {
      success: false,
      runId,
      toolRounds: 0,
      maxRoundsReached: false,
      error: errorMessage,
      state,
    };
  }
}
