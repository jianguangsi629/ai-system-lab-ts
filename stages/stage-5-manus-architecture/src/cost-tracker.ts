/**
 * Cost tracker for Stage 5: aggregate cost per session and per run.
 * Wrap chat so each response records cost; then query by session/run/total.
 */

import type { CostEstimate } from "../../stage-0-model-gateway/src/types.js";
import type { CostSnapshot, CostTracker } from "./types.js";

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function zeroSnapshot(currency: string = "USD"): CostSnapshot {
  return {
    totalCents: 0,
    currency,
    inputCents: 0,
    outputCents: 0,
    callCount: 0,
  };
}

function addCost(
  snap: CostSnapshot,
  cost: CostEstimate | undefined
): CostSnapshot {
  if (!cost) return snap;
  const currency = cost.currency ?? "USD";
  return {
    totalCents: round2(snap.totalCents + cost.totalCents),
    currency,
    inputCents: round2(snap.inputCents + cost.inputCents),
    outputCents: round2(snap.outputCents + cost.outputCents),
    callCount: snap.callCount + 1,
  };
}

/** In-memory cost tracker: keyed by session and by run. */
export function createCostTracker(): CostTracker {
  const bySession = new Map<string, CostSnapshot>();
  const byRun = new Map<string, CostSnapshot>();
  const totalSnap: CostSnapshot = zeroSnapshot();

  function ensureSession(sessionId: string): CostSnapshot {
    let snap = bySession.get(sessionId);
    if (!snap) {
      snap = zeroSnapshot();
      bySession.set(sessionId, snap);
    }
    return snap;
  }

  function ensureRun(runId: string): CostSnapshot {
    let snap = byRun.get(runId);
    if (!snap) {
      snap = zeroSnapshot();
      byRun.set(runId, snap);
    }
    return snap;
  }

  return {
    record(
      sessionId: string,
      runId: string | undefined,
      cost: CostEstimate | undefined
    ): void {
      if (!cost) return;
      const sessionSnap = ensureSession(sessionId);
      const newSession = addCost(sessionSnap, cost);
      bySession.set(sessionId, newSession);

      if (runId) {
        const runSnap = ensureRun(runId);
        const newRun = addCost(runSnap, cost);
        byRun.set(runId, newRun);
      }

      const newTotal = addCost(totalSnap, cost);
      totalSnap.totalCents = newTotal.totalCents;
      totalSnap.inputCents = newTotal.inputCents;
      totalSnap.outputCents = newTotal.outputCents;
      totalSnap.callCount = newTotal.callCount;
      totalSnap.currency = newTotal.currency;
    },

    getSessionCost(sessionId: string): CostSnapshot {
      return { ...(bySession.get(sessionId) ?? zeroSnapshot()) };
    },

    getRunCost(runId: string): CostSnapshot {
      return { ...(byRun.get(runId) ?? zeroSnapshot()) };
    },

    getTotalCost(): CostSnapshot {
      return { ...totalSnap };
    },
  };
}
