/**
 * Stage 1 Context Engine 基础用法：
 * - 创建会话并追加消息（system / user / assistant）
 * - 按裁剪策略取「本次请求该用的消息」（可选：摘要作为 system 上下文）
 * - 可选：调 Stage 0 Gateway 发请求，并把助手回复写回会话
 * 输出：知识点、执行逻辑、本步调用顺序（输入 / AI 回复 / 代码处理）。
 */

import {
  buildProviderConfigFromModelMaps,
  createModelGateway,
  getDefaultModelFromMaps,
  getFallbackModelsFromMaps,
  getModelProviderMapFromMaps,
} from "../../stage-0-model-gateway/src/index.js";
import { createContextEngine } from "../src/index.js";

/** 打印 Stage 1 知识点. */
function printKnowledgePoints() {
  console.log("\n========== Stage 1 知识点 ==========");
  console.log(
    "1. Session/会话：一次对话一个 sessionId，内有多条 messages；多用户多 session 互不串线。"
  );
  console.log(
    "2. 消息角色与顺序：system/user/assistant，按顺序存、按顺序取，取出的 Message[] 直接给 Gateway.chat。"
  );
  console.log(
    "3. 上下文裁剪：maxTokens、maxMessages、trimStrategy（drop_oldest / keep_system_and_recent）。"
  );
  console.log(
    "4. 摘要记忆：setSummary(sessionId, summary)，下次请求时以一条 system 形式放在最前。"
  );
  console.log(
    "5. 与 Stage 0 分工：Context Engine 决定「给模型看什么」；Gateway 负责「怎么发、怎么重试、怎么计费」。"
  );
  console.log("====================================\n");
}

/** 打印执行逻辑. */
function printExecutionLogic() {
  console.log("---------- 执行逻辑 ----------");
  console.log(
    "1. 创建 engine + session，按顺序 addMessage（system、user、assistant、user）。"
  );
  console.log(
    "2. getMessagesForRequest(sessionId, { includeSummaryAsSystem }) 取本次该发的消息。"
  );
  console.log("3. 可选 setSummary 再取（带摘要的 system + 最近几轮）。");
  console.log(
    "4. 用取出的 messages 调 gateway.chat；将助手回复 addMessage 写回同一 session。"
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
      cost?: { totalCents: number; currency: string };
    };
  }> = [];

  const engine = createContextEngine({
    maxTokens: 2000,
    maxMessages: 20,
    trimStrategy: "keep_system_and_recent",
  });

  const sessionId = engine.createSession();
  console.log("Session created:", sessionId);

  engine.addMessage(sessionId, {
    role: "system",
    content: "You are a helpful assistant. Reply briefly.",
  });
  engine.addMessage(sessionId, {
    role: "user",
    content: "2 + 2 等于多少?",
  });
  engine.addMessage(sessionId, {
    role: "assistant",
    content: "2 + 2 等于 4。",
  });
  engine.addMessage(sessionId, {
    role: "user",
    content: "那么3 + 3 等于多少?",
  });

  const messagesForRequest = engine.getMessagesForRequest(sessionId, {
    includeSummaryAsSystem: false,
  });
  console.log("Messages for request (count):", messagesForRequest.length);
  messagesForRequest.forEach((m, i) => {
    console.log(
      `  [${i}] ${m.role}: ${m.content.slice(0, 50)}${
        m.content.length > 50 ? "..." : ""
      }`
    );
  });

  engine.setSummary(sessionId, "User asked simple math: 2+2=4, then 3+3.");
  const withSummary = engine.getMessagesForRequest(sessionId, {
    includeSummaryAsSystem: true,
    maxMessages: 10,
  });
  console.log("\nWith summary as system (count):", withSummary.length);
  console.log(
    "First message (system with summary):",
    withSummary[0]?.content.slice(0, 80) + "..."
  );

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

  const replyMessages = engine.getMessagesForRequest(sessionId, {
    includeSummaryAsSystem: true,
    maxTokens: 1500,
  });
  const request = {
    messages: replyMessages,
    temperature: 0.2,
  };
  const result = await gateway.chat(request);

  const lastMsg = request.messages[request.messages.length - 1];
  chatCallLog.push({
    request: {
      messageCount: request.messages.length,
      temperature: request.temperature,
      lastContentSnippet:
        (lastMsg?.content ?? "").slice(0, 80) +
        ((lastMsg?.content?.length ?? 80) > 80 ? "..." : ""),
    },
    response: {
      contentSnippet:
        result.content.slice(0, 200) +
        (result.content.length > 200 ? "..." : ""),
      usage: result.usage,
      cost: result.cost,
    },
  });

  engine.addMessage(sessionId, {
    role: "assistant",
    content: result.content,
  });

  console.log("\n========== 结果 ==========");
  console.log(
    "Assistant reply added to context:",
    result.content.slice(0, 100) + (result.content.length > 100 ? "..." : "")
  );
  console.log(
    "Session message count:",
    engine.getSession(sessionId)?.messages.length
  );

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
      call.response.cost
        ? `cost=${call.response.cost.totalCents} 美分 ${call.response.cost.currency}`
        : ""
    );
    console.log(
      "代码处理: 将助手回复 addMessage(sessionId, assistant, content) 写回同一 session，下一轮请求会带上这轮。"
    );
  }
  console.log(
    "\n============================================================\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
