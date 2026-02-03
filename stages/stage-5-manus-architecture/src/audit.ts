/**
 * In-memory audit log store for Stage 5.
 * Append-only log; query by session, run, or workflow.
 */

import type { AuditLogEntry, AuditLogStore } from "./types.js";

function generateId(): string {
  return `audit_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Create an in-memory audit log store. */
export function createAuditLogStore(): AuditLogStore {
  const byId = new Map<string, AuditLogEntry>();
  const bySessionId = new Map<string, string[]>();
  const byRunId = new Map<string, string[]>();
  const byWorkflowId = new Map<string, string[]>();

  function addToIndex(
    index: Map<string, string[]>,
    key: string,
    id: string
  ): void {
    let list = index.get(key);
    if (!list) {
      list = [];
      index.set(key, list);
    }
    list.push(id);
  }

  return {
    append(entry: Omit<AuditLogEntry, "id" | "timestamp">): void {
      const id = generateId();
      const timestamp = nowIso();
      const full: AuditLogEntry = { ...entry, id, timestamp };
      byId.set(id, full);
      addToIndex(bySessionId, entry.sessionId, id);
      if (entry.runId) addToIndex(byRunId, entry.runId, id);
      if (entry.workflowId) addToIndex(byWorkflowId, entry.workflowId, id);
    },

    get(id: string): AuditLogEntry | undefined {
      return byId.get(id);
    },

    listBySession(sessionId: string): AuditLogEntry[] {
      const ids = bySessionId.get(sessionId);
      if (!ids) return [];
      return ids
        .map((id) => byId.get(id))
        .filter((e): e is AuditLogEntry => e !== undefined)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    },

    listByRunId(runId: string): AuditLogEntry[] {
      const ids = byRunId.get(runId);
      if (!ids) return [];
      return ids
        .map((id) => byId.get(id))
        .filter((e): e is AuditLogEntry => e !== undefined)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    },

    listByWorkflowId(workflowId: string): AuditLogEntry[] {
      const ids = byWorkflowId.get(workflowId);
      if (!ids) return [];
      return ids
        .map((id) => byId.get(id))
        .filter((e): e is AuditLogEntry => e !== undefined)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
    },
  };
}
