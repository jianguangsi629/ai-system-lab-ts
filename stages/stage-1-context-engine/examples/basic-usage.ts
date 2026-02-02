/**
 * Stage 1 Context Engine basic usage:
 * - Create session and add messages (system / user / assistant)
 * - Get trimmed messages for a request (with optional summary as system context)
 * - Optional: call Stage 0 gateway and append assistant reply to context
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
  });

  const replyMessages = engine.getMessagesForRequest(sessionId, {
    includeSummaryAsSystem: true,
    maxTokens: 1500,
  });
  const result = await gateway.chat({
    messages: replyMessages,
    temperature: 0.2,
  });

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
