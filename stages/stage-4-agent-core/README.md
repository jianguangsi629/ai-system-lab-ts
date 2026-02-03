# Stage 4：Agent Core

目标：任务规划、多步执行、中间状态管理与失败恢复、Memory 写回。

依赖：Stage 0 Model Gateway、Stage 1 Context Engine、Stage 2 Output Control、Stage 3 Tool System。

## 设计思路

Stage 4 在 Stage 3 的「工具循环」之上做一层 **Agent 编排**：

- **任务入口**：以「目标」（goal）为输入，而不是单条 user 消息；内部将 goal 作为 user 消息交给工具循环执行。
- **多步执行**：沿用 Stage 3 的 `runToolLoop`（LLM 决策 → 解析 → 执行工具 → 回注 → 再调用 LLM），直到模型返回最终回复或达到最大轮数。
- **中间状态与失败恢复**：每次 run 生成 `runId`，将运行状态（goal、status、toolRounds、reply、error 等）写入可选的 **AgentStateStore**；支持按 session 列出历史 run、按 runId 查询，便于审计与后续扩展「从某一步恢复」。
- **Memory 写回**：可选地在 run 结束后，将本次执行的简短摘要写入 Context Engine 的 `setSummary(sessionId, summary)`，供后续对话使用。

当前实现采用「单目标 + 工具循环」的 reactive 模式，没有显式的 Planning 步骤（如先让 LLM 输出多步计划再逐步执行）；规划能力体现在 LLM 在工具循环中自行决定是否调用工具、何时结束。若需「先规划再执行」的 Plan-and-Execute 模式，可在本层扩展：先调用一次 LLM 得到步骤列表，再按步骤执行并写状态。

## 架构示意

```
                    +------------------+
                    |   User / Goal     |
                    +--------+---------+
                             |
                             v
+------------------------------------------------------------------+
|                      Stage 4 Agent Core                           |
|  runAgent(sessionId, goal)                                        |
|  - 生成 runId，可选写入 StateStore (running)                      |
|  - 调用 Stage 3 runToolLoop(sessionId, goal)                      |
|  - 结束后写 StateStore (completed/failed)，可选 setSummary         |
|  - 返回 AgentRunResult (runId, reply, state, ...)                 |
+------------------------------------------------------------------+
     |                    |                    |
     v                    v                    v
+----------+      +---------------+      +------------------+
| Stage 0  |      | Stage 1       |      | Stage 2          |
| Gateway  |      | Context Engine|      | Output Control    |
+----------+      +---------------+      +------------------+
     |                    |                    |
     +--------------------+--------------------+
                          |
                          v
                 +------------------+
                 | Stage 3 Tool     |
                 | System (Registry,|
                 | runToolLoop)     |
                 +------------------+
```

## 核心类型

- **AgentRunState**：单次 run 的快照（runId, sessionId, goal, status, startedAt, finishedAt, toolRounds, reply, error 等）。
- **AgentStateStore**：存储 / 按 runId 查询 / 按 sessionId 列出的接口；默认提供内存实现 `createAgentStateStore()`。
- **AgentRunResult**：`runAgent` 的返回值（success, runId, reply, toolRounds, state 等）。
- **AgentDeps**：依赖 Stage 0 chat、Stage 1 contextEngine、Stage 2 outputController、Stage 3 toolRegistry，以及可选的 stateStore。

## 运行示例

在项目根目录：

```bash
npm run stage:4
```

会执行 `stages/stage-4-agent-core/examples/basic-usage.ts`：创建 session、注册工具、调用 `runAgent` 完成一次「上海天气」目标，并演示 stateStore 按 session 列出 run、以及 Memory 写回后的 `getSummary`。

## 状态说明

- 已实现：单目标 + 工具循环编排、run 状态持久化（内存 store）、失败时写入 failed 状态、可选 Memory 写回。
- 可扩展：Plan-and-Execute（先规划步骤再执行）、从某 runId/step 恢复、更丰富的 summary 生成（如再调一次 LLM 总结）。
