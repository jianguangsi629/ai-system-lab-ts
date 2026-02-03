/**
 * Human-in-the-loop for Stage 5: request approval at key points (e.g. between workflow steps).
 */

import type {
  HumanApprovalProvider,
  HumanApprovalRequest,
  HumanApprovalResult,
} from "./types.js";

import * as readline from "node:readline";

/**
 * Create a human approval provider that reads from stdin (y/n + optional comment).
 * For demo only; production would use UI or external approval service.
 */
export function createConsoleApprovalProvider(): HumanApprovalProvider {
  return function requestApproval(
    request: HumanApprovalRequest
  ): Promise<HumanApprovalResult> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      console.log(
        "[Human approval]",
        request.reason,
        JSON.stringify(request.payload)
      );
      rl.question("Approve? (y/n) [comment]: ", (line: string) => {
        rl.close();
        const trimmed = line.trim();
        const approved = /^y/i.test(trimmed);
        const commentMatch = trimmed.match(/\s+(.+)$/);
        const comment = commentMatch ? commentMatch[1].trim() : undefined;
        resolve({ approved, comment });
      });
    });
  };
}

/**
 * Create a human approval provider that auto-approves (for tests or no-op).
 */
export function createAutoApprovalProvider(
  approved: boolean = true
): HumanApprovalProvider {
  return async (
    _request: HumanApprovalRequest
  ): Promise<HumanApprovalResult> => ({
    approved,
  });
}
