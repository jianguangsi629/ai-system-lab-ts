/**
 * In-memory store for agent run states.
 * Enables recovery (resume from last good state) and audit (list runs by session).
 */

import type { AgentRunState, AgentStateStore } from "./types.js";

/** Create an in-memory agent state store. */
export function createAgentStateStore(): AgentStateStore {
  const byRunId = new Map<string, AgentRunState>();
  const bySessionId = new Map<string, Set<string>>();

  return {
    get(runId: string): AgentRunState | undefined {
      return byRunId.get(runId);
    },

    set(state: AgentRunState): void {
      byRunId.set(state.runId, state);
      let set = bySessionId.get(state.sessionId);
      if (!set) {
        set = new Set();
        bySessionId.set(state.sessionId, set);
      }
      set.add(state.runId);
    },

    delete(runId: string): boolean {
      const state = byRunId.get(runId);
      if (!state) return false;
      byRunId.delete(runId);
      const set = bySessionId.get(state.sessionId);
      if (set) {
        set.delete(runId);
        if (set.size === 0) bySessionId.delete(state.sessionId);
      }
      return true;
    },

    listBySession(sessionId: string): AgentRunState[] {
      const set = bySessionId.get(sessionId);
      if (!set) return [];
      return Array.from(set)
        .map((id) => byRunId.get(id))
        .filter((s): s is AgentRunState => s !== undefined)
        .sort(
          (a, b) =>
            new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
        );
    },
  };
}
