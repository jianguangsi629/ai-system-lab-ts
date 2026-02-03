/**
 * Stage 0 Model Gateway 基础用法：
 * 从全局配置组装 Gateway，发一次 chat 请求，展示返回的 content / usage / cost。
 * 输出：知识点、执行逻辑、本步调用顺序（输入 / AI 回复 / 代码处理）。
 */

import {
  buildProviderConfigFromModelMaps,
  createModelGateway,
  getDefaultModelFromMaps,
  getFallbackModelsFromMaps,
  getModelProviderMapFromMaps,
} from "../src/index.js";

/** 打印 Stage 0 知识点. */
function printKnowledgePoints() {
  console.log("\n========== Stage 0 知识点 ==========");
  console.log(
    "1. 模型网关：统一封装多厂商 LLM API（OpenAI/Claude/DeepSeek 等），支持模型切换、超时、重试、降级。"
  );
  console.log(
    "2. 请求/响应：chat(messages, temperature?) 发一次请求；返回 content、usage、cost（若配置 costTable）。"
  );
  console.log(
    "3. 日志：RequestLogger 记录 request/response/error；本示例用静默 logger，结果在「调用顺序」中展示。"
  );
  console.log("====================================\n");
}

/** 打印执行逻辑. */
function printExecutionLogic() {
  console.log("---------- 执行逻辑 ----------");
  console.log(
    "1. 从环境变量/配置组装 providers、defaultModel、modelProviderMap、fallbackModels。"
  );
  console.log("2. createModelGateway(...)，可选 logger、costTable、retry。");
  console.log(
    "3. gateway.chat({ messages, temperature }) → 选模型、发请求、重试、算 cost、记日志、返回 ChatResult。"
  );
  console.log("------------------------------------\n");
}

async function main() {
  printKnowledgePoints();
  printExecutionLogic();

  const chatCallLog: Array<{
    request: {
      messageCount: number;
      temperature?: number;
      lastContentSnippet: string;
    };
    response: {
      contentSnippet: string;
      usage?: { inputTokens: number; outputTokens: number };
      finishReason?: string;
      cost?: { totalCents: number; currency: string };
    };
  }> = [];

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
    retry: { maxRetries: 2, backoffMs: 400, maxBackoffMs: 2000, jitter: 0.2 },
    logger: {
      logRequest: () => {},
      logResponse: () => {},
      logError: (e) => console.error(e),
    },
  });

  const request = {
    messages: [
      {
        role: "user" as const,
        content: "今天是星期几",
      },
    ],
    temperature: 0.2,
  };

  const result = await gateway.chat(request);

  const lastMsg = request.messages[request.messages.length - 1];
  chatCallLog.push({
    request: {
      messageCount: request.messages.length,
      temperature: request.temperature,
      lastContentSnippet:
        (lastMsg?.content ?? "").slice(0, 100) +
        ((lastMsg?.content?.length ?? 0) > 100 ? "..." : ""),
    },
    response: {
      contentSnippet:
        result.content.slice(0, 200) +
        (result.content.length > 200 ? "..." : ""),
      usage: result.usage,
      finishReason: result.finishReason,
      cost: result.cost,
    },
  });

  console.log("========== 结果 ==========");
  console.log(
    "Assistant:",
    result.content.slice(0, 300) + (result.content.length > 300 ? "..." : "")
  );
  if (result.usage) console.log("Usage:", result.usage);
  if (result.cost) {
    const c = result.cost;
    console.log("Cost (美分):", c.totalCents, c.currency);
  }

  console.log(
    "\n========== 本步调用顺序（输入 / AI 回复 / 代码处理）=========="
  );
  for (let i = 0; i < chatCallLog.length; i++) {
    const call = chatCallLog[i];
    console.log(`\n--- 第 ${i + 1} 次调用 ---`);
    console.log(
      "输入:",
      `消息条数=${call.request.messageCount}`,
      `temperature=${call.request.temperature ?? "-"}`,
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
    console.log(
      "代码处理: Gateway 将响应直接返回给调用方（无工具循环、无解析）。"
    );
  }
  console.log(
    "\n============================================================\n"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
