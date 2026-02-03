/**
 * Stage 5 Manus Architecture: multi-agent orchestration, human-in-the-loop,
 * permissions, cost tracking, audit log.
 */

export { runOrchestratedWorkflow } from "./orchestrator.js";
export { createAuditLogStore } from "./audit.js";
export {
  createPermissionChecker,
  DEFAULT_ROLE_ACTIONS,
} from "./permissions.js";
export type { ActorRoleMap, RoleActionMap } from "./permissions.js";
export { createCostTracker } from "./cost-tracker.js";
export {
  createAutoApprovalProvider,
  createConsoleApprovalProvider,
} from "./human-loop.js";
export type {
  AuditAction,
  AuditLogEntry,
  AuditLogStore,
  CostSnapshot,
  CostTracker,
  HumanApprovalProvider,
  HumanApprovalRequest,
  HumanApprovalResult,
  OrchestratedStep,
  OrchestratedStepResult,
  OrchestratedWorkflowOptions,
  OrchestratedWorkflowResult,
  OrchestratorDeps,
  PermissionAction,
  PermissionChecker,
} from "./types.js";
