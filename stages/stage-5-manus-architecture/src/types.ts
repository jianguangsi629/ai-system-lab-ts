/**
 * Stage 5 Manus Architecture types.
 * Multi-agent orchestration, human-in-the-loop, permissions, cost, audit.
 */

import type { CostEstimate } from "../../stage-0-model-gateway/src/types.js";
import type {
  AgentDeps,
  AgentRunResult,
} from "../../stage-4-agent-core/src/types.js";

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

/** Kind of auditable action. */
export type AuditAction =
  | "workflow_start"
  | "workflow_step_start"
  | "workflow_step_end"
  | "workflow_end"
  | "agent_run"
  | "human_approval_request"
  | "human_approval_result"
  | "tool_execution"
  | "permission_check";

/** Single audit log entry (append-only). */
export interface AuditLogEntry {
  /** Unique id for this entry. */
  id: string;
  /** ISO timestamp. */
  timestamp: string;
  /** Session id. */
  sessionId: string;
  /** Run id (if within an agent run). */
  runId?: string;
  /** Workflow id (if within an orchestrated workflow). */
  workflowId?: string;
  /** Step index in workflow (0-based). */
  stepIndex?: number;
  /** Who performed the action (e.g. system, userId). */
  actor: string;
  action: AuditAction;
  /** Optional resource (e.g. tool name, goal). */
  resource?: string;
  /** Optional details (e.g. success, error, cost). */
  details?: Record<string, unknown>;
}

/** Store for audit log: append and query by session/run/workflow. */
export interface AuditLogStore {
  append(entry: Omit<AuditLogEntry, "id" | "timestamp">): void;
  get(id: string): AuditLogEntry | undefined;
  listBySession(sessionId: string): AuditLogEntry[];
  listByRunId(runId: string): AuditLogEntry[];
  listByWorkflowId(workflowId: string): AuditLogEntry[];
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/** Actions that can be permission-checked. */
export type PermissionAction =
  | "run_agent"
  | "run_workflow"
  | "approve_tool"
  | "view_audit"
  | "view_cost";

/** Check if an actor is allowed to perform an action. */
export type PermissionChecker = (
  actorId: string,
  action: PermissionAction,
  resource?: string
) => boolean;

// ---------------------------------------------------------------------------
// Human-in-the-loop
// ---------------------------------------------------------------------------

/** Request for human approval (e.g. before tool execution or between steps). */
export interface HumanApprovalRequest {
  runId: string;
  workflowId?: string;
  stepIndex?: number;
  /** Reason for approval (e.g. "tool_execution", "step_continue"). */
  reason: string;
  /** Payload (e.g. tool name + args). */
  payload: Record<string, unknown>;
}

/** Result of human approval. */
export interface HumanApprovalResult {
  approved: boolean;
  comment?: string;
}

/** Provider that requests human approval and returns result. */
export type HumanApprovalProvider = (
  request: HumanApprovalRequest
) => Promise<HumanApprovalResult>;

// ---------------------------------------------------------------------------
// Cost tracking
// ---------------------------------------------------------------------------

/** Aggregate cost for a session or run. */
export interface CostSnapshot {
  totalCents: number;
  currency: string;
  inputCents: number;
  outputCents: number;
  /** Number of chat calls included. */
  callCount: number;
}

/** Tracks cost per session/run by wrapping chat and recording usage. */
export interface CostTracker {
  /** Record cost from a chat result (called by wrapped chat). */
  record(
    sessionId: string,
    runId: string | undefined,
    cost: CostEstimate | undefined
  ): void;
  getSessionCost(sessionId: string): CostSnapshot;
  getRunCost(runId: string): CostSnapshot;
  getTotalCost(): CostSnapshot;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/** Single step in an orchestrated workflow (one goal per step = one agent run). */
export interface OrchestratedStep {
  goal: string;
  /** Optional label for audit. */
  label?: string;
}

/** Result of one step in a workflow. */
export interface OrchestratedStepResult {
  stepIndex: number;
  goal: string;
  label?: string;
  agentResult: AgentRunResult;
  /** Whether human approval was requested and result. */
  approvalRequested?: boolean;
  approvalResult?: HumanApprovalResult;
}

/** Result of running an orchestrated workflow (multi-step, multi-agent). */
export interface OrchestratedWorkflowResult {
  success: boolean;
  workflowId: string;
  sessionId: string;
  steps: OrchestratedStepResult[];
  /** Total cost for the workflow (if cost tracker provided). */
  totalCost?: CostSnapshot;
  error?: string;
}

/** Options for running an orchestrated workflow. */
export interface OrchestratedWorkflowOptions {
  /** Request human approval before each step (after previous step, before next). */
  approveBetweenSteps?: boolean;
  /** Optional actor id for audit and permission. */
  actorId?: string;
  /** Agent run options passed to each runAgent. */
  agentRunOptions?: import("../../stage-4-agent-core/src/types.js").AgentRunOptions;
}

/** Dependencies for the orchestrator: agent deps + optional audit, permission, human approval, cost. */
export interface OrchestratorDeps extends AgentDeps {
  /** Optional audit log store. */
  auditLog?: AuditLogStore;
  /** Optional permission checker (called before workflow and optionally before steps). */
  permissionCheck?: PermissionChecker;
  /** Optional human approval (e.g. between steps or before tool execution). */
  humanApproval?: HumanApprovalProvider;
  /**
   * Optional cost tracker. If provided, orchestrator wraps chat so each call
   * records cost; you must pass the same wrapped chat in deps.chat when using costTracker.
   */
  costTracker?: CostTracker;
}
