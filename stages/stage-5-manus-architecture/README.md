# Stage 5：Manus Architecture

目标：多 Agent 协作、人类介入工作流、权限与成本控制、审计日志。用于理解 Manus / Devin / AI OS 的架构模式。

依赖：Stage 0 Model Gateway 至 Stage 4 Agent Core。

## 设计思路

Stage 5 在 Stage 4 的「单目标 Agent」之上做一层 **产品级编排**：

- **多步工作流（多 Agent 协作）**：以「步骤列表」（多个 goal）为输入，按序执行多个 agent run；每步对应一个 goal、一次 runAgent；上下文在 session 内累积，支持「先调研再写报告」等流水线。
- **人类介入（Human-in-the-loop）**：可选地在步骤之间请求人工批准（approveBetweenSteps）；提供 `HumanApprovalProvider` 接口，可接入控制台输入或外部审批服务。
- **权限**：可选的 `PermissionChecker`，在启动工作流前检查 actor 是否有 `run_workflow` 等权限；角色与动作可配置。
- **成本**：可选的 `CostTracker`，通过包装 chat 记录每次调用的 cost，按 session / 全局聚合；工作流结束后可查询 `totalCost`。
- **审计日志**：可选的 `AuditLogStore`，对 workflow_start、workflow_step_start/end、human_approval、workflow_end 等事件做 append-only 记录，支持按 session、run、workflow 查询。

当前实现采用「顺序多步 + 可选步骤间批准」的模式；每步仍是 Stage 4 的 runAgent（单目标 + 工具循环）。若需「多 Agent 并行」或「Agent 间消息传递」，可在本层扩展。

## 架构示意

```
                    +------------------+
                    | Workflow Steps   |
                    | (goal1, goal2…)  |
                    +--------+---------+
                             |
                             v
+------------------------------------------------------------------+
|                   Stage 5 Manus Architecture                      |
|  runOrchestratedWorkflow(sessionId, steps, options)               |
|  - permissionCheck(actorId, "run_workflow")                       |
|  - audit: workflow_start                                         |
|  - for each step:                                                |
|      - optional humanApproval (between steps)                    |
|      - audit: workflow_step_start                                |
|      - runAgent(sessionId, goal)  [Stage 4]                      |
|      - audit: workflow_step_end, costTracker.record              |
|  - audit: workflow_end                                           |
|  - return OrchestratedWorkflowResult (steps, totalCost)          |
+------------------------------------------------------------------+
     |                    |                    |
     v                    v                    v
+----------+      +---------------+      +------------------+
| AuditLog |      | CostTracker   |      | HumanApproval    |
| Store    |      | (wrap chat)   |      | Provider         |
+----------+      +---------------+      +------------------+
     |                    |                    |
     +--------------------+--------------------+
                          |
                          v
                 +------------------+
                 | Stage 4 Agent     |
                 | (runAgent)        |
                 +------------------+
```

## 核心类型

- **OrchestratorDeps**：继承 AgentDeps，可选 auditLog、permissionCheck、humanApproval、costTracker。
- **OrchestratedStep**：单步 `{ goal, label? }`。
- **OrchestratedWorkflowResult**：workflowId、steps（每步的 AgentRunResult）、totalCost、success。
- **AuditLogStore**：append、listBySession、listByRunId、listByWorkflowId。
- **CostTracker**：record(sessionId, runId?, cost)、getSessionCost、getRunCost、getTotalCost（当前仅 session/总级，per-run 需 Stage 4 回调扩展）。
- **PermissionChecker**：(actorId, action) => boolean；默认角色 user/admin 与动作可配置。
- **HumanApprovalProvider**：(request) => Promise<HumanApprovalResult>；提供控制台与自动通过实现。

## 运行示例

在项目根目录：

```bash
npm run stage:5
```

会执行 `stages/stage-5-manus-architecture/examples/basic-usage.ts`：创建 session、注册工具、配置 audit/cost/permission、运行多步工作流（如先问天气再问时间），并输出审计条目与成本。

## 状态说明

- 已实现：多步工作流、步骤间可选人类批准、审计日志、按 session 成本统计、权限检查。
- 可扩展：工具执行前的人类批准（需包装 ToolRegistry）、per-run 成本（需 Stage 4 chat 回调）、多 Agent 并行与消息传递。
