/**
 * Stage 5 Manus Architecture 基础用法：
 * - 使用 Stage 0~4 搭建 Gateway、Context、Output、Tool、Agent
 * - 配置审计日志、成本统计、权限、人类批准（本示例用自动通过）
 * - 运行多步工作流：先问上海天气，再问当前时间，输出审计条目与成本
 */

import {
  buildProviderConfigFromModelMaps,
  createModelGateway,
  getDefaultModelFromMaps,
  getFallbackModelsFromMaps,
  getModelProviderMapFromMaps,
} from "../../stage-0-model-gateway/src/index.js";
import type { ProcessingReport } from "../../stage-3-tool-system/src/types.js";
import { createContextEngine } from "../../stage-1-context-engine/src/index.js";
import { createOutputController } from "../../stage-2-output-control/src/index.js";
import {
  createToolRegistry,
  type Tool,
} from "../../stage-3-tool-system/src/index.js";
import { createAgentStateStore } from "../../stage-4-agent-core/src/index.js";
import {
  createAuditLogStore,
  createAutoApprovalProvider,
  createCostTracker,
  createPermissionChecker,
  DEFAULT_ROLE_ACTIONS,
  runOrchestratedWorkflow,
} from "../src/index.js";

// ---------- 工具定义（与 Stage 3/4 一致）----------

const getWeatherTool: Tool<
  { city: string },
  { city: string; temp: number; unit: string }
> = {
  name: "get_weather",
  description:
    "Get current weather for a given city. Use when user asks about weather.",
  parameters: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "City name, e.g. Beijing, Shanghai",
      },
    },
    required: ["city"],
    additionalProperties: false,
  },
  async execute(args) {
    const temp = 18 + Math.floor(Math.random() * 10);
    return { city: args.city, temp, unit: "celsius" };
  },
};

const getTimeTool: Tool<Record<string, never>, string> = {
  name: "get_time",
  description:
    "Get current date and time. Use when user asks what time it is or today's date.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async execute() {
    return new Date().toISOString();
  },
};

/** 打印 Stage 5 知识点（便于对照输出理解）. */
function printKnowledgePoints() {
  console.log("\n========== Stage 5 知识点 ==========");
  console.log(
    "1. 多 Agent 协作：一个 workflow = 多步有序执行；每步 = 一次 runAgent(goal)；同一 session 内上下文累积。"
  );
  console.log(
    "2. 人类介入：HumanApprovalProvider 可在步骤间暂停（approveBetweenSteps）；本示例用自动通过。"
  );
  console.log(
    "3. 权限：PermissionChecker(actorId, action)，actor → role → 允许的 actions；启动前检查 run_workflow。"
  );
  console.log(
    "4. 成本：CostTracker 包装 chat，记录每次调用的 cost；按 session 与全局聚合。"
  );
  console.log(
    "5. 审计：AuditLogStore 仅追加；记录 workflow_start、step_start/step_end、workflow_end；可按 session/run/workflow 查询。"
  );
  console.log("====================================\n");
}

/** 打印执行逻辑顺序（便于把日志对应到代码流程）. */
function printExecutionLogic() {
  console.log("---------- 执行逻辑（顺序）----------");
  console.log(
    "1. permissionCheck(actorId, 'run_workflow')；若拒绝则返回错误并记一条 workflow_start 审计。"
  );
  console.log("2. 审计：workflow_start（stepCount）。");
  console.log("3. 若有 costTracker：包装 chat，使每次 chat() 都记录 cost。");
  console.log("4. 对每一步：");
  console.log(
    "   a. [若 approveBetweenSteps 且 stepIndex>0] humanApproval(...)，记 human_approval_request/result；若不通过则 break。"
  );
  console.log("   b. 审计：workflow_step_start（goal）。");
  console.log(
    "   c. runAgent(sessionId, goal) [Stage 4 工具循环直到有 reply 或达到 max rounds]。"
  );
  console.log("   d. 审计：workflow_step_end（success、toolRounds、error）。");
  console.log("5. 审计：workflow_end（stepsCompleted、totalSteps）。");
  console.log("6. 返回 OrchestratedWorkflowResult（steps、totalCost）。");
  console.log("------------------------------------\n");
}

/** 将一次「代码处理」格式化为中文说明. */
function formatProcessing(p: ProcessingReport): string {
  if (p.kind === "parse_failed") {
    return `解析失败: ${p.errors.join("; ")}`;
  }
  if (p.kind === "final_reply") {
    return `解析为最终回复，本步结束。回复内容: ${p.reply.slice(0, 80)}${
      p.reply.length > 80 ? "..." : ""
    }`;
  }
  return `解析为工具调用: ${p.tool}(${JSON.stringify(p.args)})，执行后得到: ${
    p.resultSnippet
  }`;
}

async function main() {
  printKnowledgePoints();
  printExecutionLogic();

  const chatCallLog: Array<{
    request: {
      messageCount: number;
      temperature?: number;
      maxTokens?: number;
      lastContentSnippet: string;
    };
    response: {
      contentSnippet: string;
      usage?: { inputTokens: number; outputTokens: number };
      finishReason?: string;
      cost?: { totalCents: number; currency: string };
    };
  }> = [];
  const processingLog: Array<{
    runId: string;
    round: number;
    processing: ProcessingReport;
  }> = [];

  const engine = createContextEngine({
    maxTokens: 4000,
    maxMessages: 30,
    trimStrategy: "keep_system_and_recent",
  });
  const sessionId = engine.createSession();

  const providers = buildProviderConfigFromModelMaps();
  const defaultModel = getDefaultModelFromMaps();
  const modelProviderMap = getModelProviderMapFromMaps();
  const fallbackModels = getFallbackModelsFromMaps().filter(
    (m) => m !== defaultModel
  );
  const gateway = createModelGateway({
    providers,
    defaultModel,
    modelProviderMap,
    fallbackModels,
    timeoutMs: 20000,
    logger: {
      logRequest: () => {},
      logResponse: () => {},
      logError: (e) => console.error(e),
    },
  });

  const realChat = gateway.chat.bind(gateway);
  const wrappedChat = async (request: Parameters<typeof realChat>[0]) => {
    const res = await realChat(request);
    const lastMsg = request.messages[request.messages.length - 1];
    chatCallLog.push({
      request: {
        messageCount: request.messages.length,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        lastContentSnippet:
          (lastMsg?.content ?? "").slice(0, 100) +
          ((lastMsg?.content?.length ?? 0) > 100 ? "..." : ""),
      },
      response: {
        contentSnippet:
          res.content.slice(0, 200) + (res.content.length > 200 ? "..." : ""),
        usage: res.usage,
        finishReason: res.finishReason,
        cost: res.cost,
      },
    });
    return res;
  };

  const outputController = createOutputController({
    stripMarkdownCodeBlock: true,
  });
  const registry = createToolRegistry();
  registry.register(getWeatherTool);
  registry.register(getTimeTool);

  const stateStore = createAgentStateStore();
  const auditLog = createAuditLogStore();
  const costTracker = createCostTracker();
  const permissionCheck = createPermissionChecker(
    { alice: "user", bob: "admin" },
    DEFAULT_ROLE_ACTIONS
  );
  const humanApproval = createAutoApprovalProvider(true);

  const deps = {
    chat: wrappedChat,
    contextEngine: engine,
    outputController,
    toolRegistry: registry,
    stateStore,
    auditLog,
    permissionCheck,
    humanApproval,
    costTracker,
  };

  const steps = [
    {
      goal: "What is the weather in Shanghai? Reply in one short sentence.",
      label: "weather",
    },
    {
      goal: "What time is it now? Reply in one short sentence.",
      label: "time",
    },
  ];

  console.log(
    "工作流步骤:",
    steps.map((s) => s.label ?? s.goal.slice(0, 40))
  );
  console.log(
    "(逻辑：permissionCheck(alice, run_workflow)；2 步，未开 approveBetweenSteps；每步 = 一次 runAgent。)\n"
  );
  const result = await runOrchestratedWorkflow(deps, sessionId, steps, {
    actorId: "alice",
    approveBetweenSteps: false,
    agentRunOptions: {
      maxToolRounds: 5,
      temperature: 0.1,
      maxTokens: 500,
      writeSummaryToMemory: true,
      onAfterChat: (runId, round, _chatResult, processing) => {
        processingLog.push({ runId, round, processing });
      },
    },
  });

  console.log("\n========== 结果 ==========");
  console.log("工作流 id:", result.workflowId);
  console.log("成功:", result.success);
  console.log("完成步数:", result.steps.length);
  for (const step of result.steps) {
    console.log(
      `  第 ${step.stepIndex} 步 (${step.label ?? step.goal.slice(0, 30)}):`,
      step.agentResult.success ? "成功" : "失败",
      step.agentResult.reply?.slice(0, 80)
    );
  }
  if (result.totalCost) {
    console.log(
      "总成本:",
      result.totalCost.totalCents,
      "美分",
      result.totalCost.currency,
      "调用次数:",
      result.totalCost.callCount
    );
  }
  if (result.error) console.log("错误:", result.error);

  const entries = auditLog.listByWorkflowId(result.workflowId);
  console.log("\n本工作流审计条数:", entries.length);
  for (const e of entries.slice(0, 8)) {
    console.log("  ", e.timestamp, e.action, e.resource ?? "");
  }

  console.log(
    "\n========== 工作流中的调用顺序（输入 / AI 回复 / 代码处理）=========="
  );
  for (let i = 0; i < chatCallLog.length; i++) {
    const call = chatCallLog[i];
    const proc = processingLog[i];
    console.log(`\n--- 第 ${i + 1} 次调用 ---`);
    console.log(
      "输入:",
      `消息条数=${call.request.messageCount}`,
      `temperature=${call.request.temperature ?? "-"}`,
      `maxTokens=${call.request.maxTokens ?? "-"}`,
      `最后一条内容摘要: ${call.request.lastContentSnippet || "(无)"}`
    );
    console.log(
      "AI 回复:",
      `内容摘要: ${call.response.contentSnippet}`,
      `usage: input=${call.response.usage?.inputTokens ?? "-"} output=${
        call.response.usage?.outputTokens ?? "-"
      }`,
      `finishReason=${call.response.finishReason ?? "-"}`,
      call.response.cost
        ? `cost=${call.response.cost.totalCents} 美分 ${call.response.cost.currency}`
        : ""
    );
    console.log("代码处理:", proc ? formatProcessing(proc.processing) : "(无)");
  }
  console.log(
    "\n============================================================\n"
  );

  console.log("\n---------- 输出与逻辑对照 ----------");
  console.log(
    "- 上面 JSON 行 = Stage 0 Gateway 的 request/response（每次 chat 一条）。4 次调用 = 第 0 步工具轮数 + 第 1 步工具轮数（如 1+1+2=4 次 chat）。"
  );
  console.log(
    "- 审计 6 条 = 1 个 workflow_start + 2×(workflow_step_start + workflow_step_end) + 1 个 workflow_end（对应逻辑 2、4b/4d、5）。"
  );
  console.log(
    "- 总成本 = 上述 4 次 chat 的 cost 之和（由包装后的 chat 里 CostTracker.record 累加）。"
  );
  console.log(
    "- 每步 reply = 该步 runAgent 里 Stage 4 工具循环结束时 LLM 的最终回复（tool:null, reply:...）。"
  );
  console.log(
    "------------------------------------------------------------------------\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
