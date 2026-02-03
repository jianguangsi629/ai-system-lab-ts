/**
 * Stage 4 Agent Core 基础用法：
 * - 使用 Stage 0 Gateway + Stage 1 Context Engine + Stage 2 Output Controller + Stage 3 Tool System
 * - 通过 runAgent(sessionId, goal) 执行「目标」：注入 goal 为 user 消息，跑工具循环，可选写回 Memory
 * - 可选 stateStore：持久化每次 run 的状态，支持按 session 查询、失败恢复与审计
 * 输出：知识点、执行逻辑、本步调用顺序（输入 / AI 回复 / 代码处理）。
 */

import {
  buildProviderConfigFromModelMaps,
  createModelGateway,
  getDefaultModelFromMaps,
  getFallbackModelsFromMaps,
  getModelProviderMapFromMaps,
} from "../../stage-0-model-gateway/src/index.js";
import { createContextEngine } from "../../stage-1-context-engine/src/index.js";
import { createOutputController } from "../../stage-2-output-control/src/index.js";
import {
  createToolRegistry,
  type Tool,
} from "../../stage-3-tool-system/src/index.js";
import type { ProcessingReport } from "../../stage-3-tool-system/src/types.js";
import { createAgentStateStore, runAgent } from "../src/index.js";

// ---------- 工具定义（与 Stage 3 示例一致）----------

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

/** 打印 Stage 4 知识点. */
function printKnowledgePoints() {
  console.log("\n========== Stage 4 知识点 ==========");
  console.log(
    "1. 任务入口 Goal：runAgent(sessionId, goal) 将 goal 作为 user 消息交给 runToolLoop。"
  );
  console.log(
    "2. 多步执行：沿用 Stage 3 runToolLoop，LLM 决策→解析→执行工具→回注，直到 final reply 或 maxRounds。"
  );
  console.log(
    "3. 中间状态：runId、AgentRunState（status、toolRounds、reply、error）；可选 AgentStateStore 持久化。"
  );
  console.log(
    "4. Memory 写回：可选 run 结束后 setSummary(sessionId, summary) 供后续对话使用。"
  );
  console.log(
    "5. runAgent：生成 runId、写 stateStore(running)、runToolLoop、写 stateStore(completed/failed)、可选 setSummary。"
  );
  console.log("====================================\n");
}

/** 打印执行逻辑. */
function printExecutionLogic() {
  console.log("---------- 执行逻辑 ----------");
  console.log(
    "1. 创建 engine、gateway、outputController、registry、stateStore，组装 deps。"
  );
  console.log(
    "2. runAgent(deps, sessionId, goal)：runToolLoop 内每轮 chat→parse→(tool_call 则 execute+inject) 或 final_reply。"
  );
  console.log("3. 结束后写 stateStore、可选 setSummary；返回 AgentRunResult。");
  console.log("------------------------------------\n");
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

  const deps = {
    chat: wrappedChat,
    contextEngine: engine,
    outputController,
    toolRegistry: registry,
    stateStore,
  };

  const goal = "What is the weather in Shanghai? Reply in one short sentence.";
  console.log("Goal:", goal);

  const result = await runAgent(deps, sessionId, goal, {
    maxToolRounds: 5,
    temperature: 0.1,
    maxTokens: 500,
    writeSummaryToMemory: true,
    onAfterChat: (runId, round, _chatResult, processing) => {
      processingLog.push({ runId, round, processing });
    },
  });

  console.log("\n========== 结果 ==========");
  console.log("Run id:", result.runId);
  console.log("成功:", result.success);
  if (result.reply !== undefined) {
    console.log("Reply:", result.reply);
  } else if (result.lastRawContent) {
    console.log(
      "Last raw (no final reply):",
      result.lastRawContent.slice(0, 200)
    );
  }
  console.log("Tool rounds:", result.toolRounds);
  console.log("Max rounds reached:", result.maxRoundsReached);
  if (result.error) console.log("Error:", result.error);

  const runs = stateStore.listBySession(sessionId);
  console.log("Runs in session:", runs.length);
  const summary = engine.getSummary(sessionId);
  console.log("Memory summary:", summary ?? "(none)");

  console.log(
    "\n========== 本步调用顺序（输入 / AI 回复 / 代码处理）=========="
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
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
