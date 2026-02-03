/**
 * Stage 5 Orchestrator: multi-step workflow with audit, permission, human approval, cost.
 * Each step runs one agent (runAgent); optional human approval between steps; audit and cost tracked.
 */

import { runAgent } from "../../stage-4-agent-core/src/agent.js";
import type {
  AgentRunResult,
  AgentRunState,
} from "../../stage-4-agent-core/src/types.js";
import type {
  AuditLogStore,
  CostTracker,
  HumanApprovalProvider,
  OrchestratedStep,
  OrchestratedStepResult,
  OrchestratedWorkflowOptions,
  OrchestratedWorkflowResult,
  OrchestratorDeps,
  PermissionChecker,
} from "./types.js";

function generateWorkflowId(): string {
  return `wf_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Wrap chat to record cost for the given session (per-run cost requires Stage 4 integration). */
function wrapChatForCost(
  chat: OrchestratorDeps["chat"],
  costTracker: CostTracker,
  sessionId: string
): OrchestratorDeps["chat"] {
  return async (request) => {
    const result = await chat(request);
    costTracker.record(sessionId, undefined, result.cost);
    return result;
  };
}

/**
 * Run an orchestrated workflow: multiple steps (goals), each step = one agent run.
 * Optional: permission check before workflow, human approval between steps, audit log, cost tracking.
 */
export async function runOrchestratedWorkflow(
  deps: OrchestratorDeps,
  sessionId: string,
  steps: OrchestratedStep[],
  options: OrchestratedWorkflowOptions = {}
): Promise<OrchestratedWorkflowResult> {
  const workflowId = generateWorkflowId();
  const actorId = options.actorId ?? "system";
  const approveBetweenSteps = options.approveBetweenSteps ?? false;
  const agentRunOptions = options.agentRunOptions ?? {};

  if (deps.permissionCheck && !deps.permissionCheck(actorId, "run_workflow")) {
    const err = "Permission denied: run_workflow";
    deps.auditLog?.append({
      sessionId,
      workflowId,
      actor: actorId,
      action: "workflow_start",
      details: { error: err },
    });
    return {
      success: false,
      workflowId,
      sessionId,
      steps: [],
      error: err,
    };
  }

  deps.auditLog?.append({
    sessionId,
    workflowId,
    actor: actorId,
    action: "workflow_start",
    details: { stepCount: steps.length },
  });

  const stepResults: OrchestratedStepResult[] = [];

  let agentDeps: OrchestratorDeps = deps;
  if (deps.costTracker) {
    agentDeps = {
      ...deps,
      chat: wrapChatForCost(deps.chat, deps.costTracker, sessionId),
    };
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const goal = step.goal;

    if (approveBetweenSteps && i > 0 && deps.humanApproval) {
      deps.auditLog?.append({
        sessionId,
        workflowId,
        stepIndex: i,
        actor: actorId,
        action: "human_approval_request",
        resource: goal.slice(0, 80),
        details: { reason: "step_continue", payload: { goal } },
      });
      const approval = await deps.humanApproval({
        runId: stepResults[i - 1]?.agentResult.runId ?? "",
        workflowId,
        stepIndex: i,
        reason: "step_continue",
        payload: { goal, previousStep: stepResults[i - 1]?.agentResult.runId },
      });
      deps.auditLog?.append({
        sessionId,
        workflowId,
        stepIndex: i,
        actor: actorId,
        action: "human_approval_result",
        details: { approved: approval.approved, comment: approval.comment },
      });
      if (!approval.approved) {
        const rejectedState: AgentRunState = {
          runId: "",
          sessionId,
          goal,
          status: "failed",
          startedAt: nowIso(),
          toolRounds: 0,
          error: "Workflow stopped: human did not approve next step",
        };
        stepResults.push({
          stepIndex: i,
          goal,
          label: step.label,
          agentResult: {
            success: false,
            runId: "",
            toolRounds: 0,
            maxRoundsReached: false,
            error: "Workflow stopped: human did not approve next step",
            state: rejectedState,
          },
          approvalRequested: true,
          approvalResult: approval,
        });
        break;
      }
    }

    deps.auditLog?.append({
      sessionId,
      workflowId,
      stepIndex: i,
      actor: actorId,
      action: "workflow_step_start",
      resource: goal.slice(0, 80),
    });

    const result = await runAgent(agentDeps, sessionId, goal, {
      ...agentRunOptions,
      writeSummaryToMemory: true,
    });

    deps.auditLog?.append({
      sessionId,
      runId: result.runId,
      workflowId,
      stepIndex: i,
      actor: actorId,
      action: "workflow_step_end",
      resource: goal.slice(0, 80),
      details: {
        success: result.success,
        toolRounds: result.toolRounds,
        error: result.error,
      },
    });

    stepResults.push({
      stepIndex: i,
      goal,
      label: step.label,
      agentResult: result,
    });
  }

  deps.auditLog?.append({
    sessionId,
    workflowId,
    actor: actorId,
    action: "workflow_end",
    details: {
      stepsCompleted: stepResults.length,
      totalSteps: steps.length,
    },
  });

  const success = stepResults.every((s) => s.agentResult.success);
  const totalCost = deps.costTracker?.getSessionCost(sessionId);

  return {
    success,
    workflowId,
    sessionId,
    steps: stepResults,
    totalCost,
    error: success
      ? undefined
      : stepResults.find((s) => !s.agentResult.success)?.agentResult.error,
  };
}
