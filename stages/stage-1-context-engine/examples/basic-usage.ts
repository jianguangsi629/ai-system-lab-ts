/**
 * Stage 1 Context Engine 基础用法：
 * - 创建会话并追加消息（system / user / assistant）
 * - 按裁剪策略取「本次请求该用的消息」（可选：摘要作为 system 上下文）
 * - 可选：调 Stage 0 Gateway 发请求，并把助手回复写回会话
 */

import {
  buildProviderConfigFromModelMaps,
  createModelGateway,
  getDefaultModelFromMaps,
  getFallbackModelsFromMaps,
  getModelProviderMapFromMaps,
} from "../../stage-0-model-gateway/src/index.js";
import { createContextEngine } from "../src/index.js";

async function main() {
  // 创建上下文引擎：最多 2000 token、20 条消息，裁剪策略为「保留 system + 最近几轮」
  const engine = createContextEngine({
    maxTokens: 2000,
    maxMessages: 20,
    trimStrategy: "keep_system_and_recent",
  });

  const sessionId = engine.createSession();
  console.log("Session created:", sessionId);

  // 按顺序追加：系统设定 → 用户问 2+2 → 助手答 4 → 用户问 3+3
  engine.addMessage(sessionId, {
    role: "system",
    content: "You are a helpful assistant. Reply briefly.",
  });
  engine.addMessage(sessionId, {
    role: "user",
    content: "What is 2 + 2?",
  });
  engine.addMessage(sessionId, {
    role: "assistant",
    content: "2 + 2 equals 4.",
  });
  engine.addMessage(sessionId, {
    role: "user",
    content: "And what is 3 + 3?",
  });

  // 取「本次请求该发的消息」，先不插摘要，看纯历史有几条
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

  // 设置摘要（压缩旧历史的文字概括），再取消息时把摘要作为第一条 system
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

  // 组装 Stage 0 Gateway，用于发真实请求
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
  });

  // 用「带摘要 + 限 1500 token」的消息列表发一次 chat
  const replyMessages = engine.getMessagesForRequest(sessionId, {
    includeSummaryAsSystem: true,
    maxTokens: 1500,
  });
  const result = await gateway.chat({
    messages: replyMessages,
    temperature: 0.2,
  });

  // 把助手回复写回同一会话，下一轮请求会带上这轮
  engine.addMessage(sessionId, {
    role: "assistant",
    content: result.content,
  });
  console.log(
    "\nAssistant reply added to context:",
    result.content.slice(0, 100) + (result.content.length > 100 ? "..." : "")
  );
  console.log(
    "Session message count:",
    engine.getSession(sessionId)?.messages.length
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
