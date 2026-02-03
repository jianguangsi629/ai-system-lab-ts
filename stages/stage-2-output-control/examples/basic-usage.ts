/**
 * Stage 2 Output Control 基础用法：
 * - 使用 Stage 0 Gateway + Stage 1 Context Engine
 * - 要求模型返回结构化 JSON
 * - 用 Output Controller 解析并校验 LLM 输出（LLM 视为不可信节点）
 * - 处理解析/校验失败的情况
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
import { createOutputController, type JsonSchema } from "../src/index.js";

/** 示例 schema：从用户文本中抽取 name 和 age，约束为 object，必填且禁止额外字段 */
const PERSON_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Person name" },
    age: { type: "number", description: "Age in years" },
  },
  required: ["name", "age"],
  additionalProperties: false,
};

/** 解析成功后的类型：与 PERSON_SCHEMA 对应 */
interface PersonOutput {
  name: string;
  age: number;
}

/** 打印 Stage 2 知识点. */
function printKnowledgePoints() {
  console.log("\n========== Stage 2 知识点 ==========");
  console.log(
    "1. LLM 视为不可信节点：模型输出可能非 JSON、缺字段、类型错，一律先解析再按 schema 校验。"
  );
  console.log(
    "2. 结构化输出与 JSON Schema：用 schema 描述期望形状；Output Controller 解析 + ajv 校验 → ParseResult<T>。"
  );
  console.log(
    "3. 解析策略：剥 markdown 代码块、取首段 JSON，避免模型前后说明污染解析。"
  );
  console.log(
    "4. 与 Stage 0/1 分工：Gateway 给 raw text；Output Controller 给 parsed+validated 的 T 或 errors。"
  );
  console.log("====================================\n");
}

/** 打印执行逻辑. */
function printExecutionLogic() {
  console.log("---------- 执行逻辑 ----------");
  console.log("1. 第一/二段：本地 parseAndValidate 好/坏样例（不调模型）。");
  console.log(
    "2. 第三段：Context Engine 准备 messages → Gateway.chat 拿 content → parseAndValidate(content)；成功则写回会话。"
  );
  console.log("------------------------------------\n");
}

async function main() {
  printKnowledgePoints();
  printExecutionLogic();

  const outputController = createOutputController({
    stripMarkdownCodeBlock: true,
  });

  // ---------- 第一段：本地「好」样例（不调模型）----------
  const rawGood = '```json\n{"name": "Alice", "age": 30}\n```';
  const resultGood = outputController.parseAndValidate<PersonOutput>(rawGood, {
    schema: PERSON_SCHEMA,
  });
  if (resultGood.success) {
    console.log("Parsed (good):", resultGood.data);
  } else {
    console.log("Parse failed:", resultGood.errors);
  }

  // ---------- 第二段：本地「坏」样例（不调模型）----------
  const rawBad = '{"name": "Bob", "age": "not a number"}';
  const resultBad = outputController.parseAndValidate<PersonOutput>(rawBad, {
    schema: PERSON_SCHEMA,
  });
  if (resultBad.success) {
    console.log("Parsed (bad):", resultBad.data);
  } else {
    console.log("Validation failed (expected):", resultBad.errors);
  }

  // ---------- 第三段：完整流水线（Context Engine → Gateway → Output Controller）----------
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
      cost?: { totalCents: number; currency: string };
    };
  }> = [];

  const engine = createContextEngine({
    maxTokens: 2000,
    maxMessages: 20,
    trimStrategy: "keep_system_and_recent",
  });

  const sessionId = engine.createSession();
  const systemPrompt = `You are a helpful assistant. Extract structured data from the user's message.
Respond with a single JSON object only, no other text. Use this shape: { "name": string, "age": number }.
Example: {"name": "Alice", "age": 25}`;
  engine.addMessage(sessionId, { role: "system", content: systemPrompt });
  engine.addMessage(sessionId, {
    role: "user",
    content: "My name is Charlie and I am 28 years old.",
  });

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

  const messages = engine.getMessagesForRequest(sessionId, {
    includeSummaryAsSystem: false,
  });
  const request = {
    messages,
    temperature: 0.1,
    maxTokens: 500,
  };
  const chatResult = await gateway.chat(request);

  const lastMsg = request.messages[request.messages.length - 1];
  chatCallLog.push({
    request: {
      messageCount: request.messages.length,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      lastContentSnippet:
        (lastMsg?.content ?? "").slice(0, 80) +
        ((lastMsg?.content?.length ?? 0) > 80 ? "..." : ""),
    },
    response: {
      contentSnippet:
        chatResult.content.slice(0, 200) +
        (chatResult.content.length > 200 ? "..." : ""),
      usage: chatResult.usage,
      cost: chatResult.cost,
    },
  });

  const parsed = outputController.parseAndValidate<PersonOutput>(
    chatResult.content,
    { schema: PERSON_SCHEMA }
  );

  if (parsed.success) {
    console.log("\nStructured output from LLM:", parsed.data);
    engine.addMessage(sessionId, {
      role: "assistant",
      content: chatResult.content,
    });
  } else {
    console.log("\nLLM output invalid (untrusted node):", parsed.errors);
    if (parsed.raw) {
      console.log("Raw snippet:", parsed.raw.slice(0, 200));
    }
  }

  console.log("\n========== 本步调用顺序（第三段：一次 chat）==========");
  for (let i = 0; i < chatCallLog.length; i++) {
    const call = chatCallLog[i];
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
      call.response.cost
        ? `cost=${call.response.cost.totalCents} 美分 ${call.response.cost.currency}`
        : ""
    );
    console.log(
      "代码处理:",
      parsed.success
        ? `parseAndValidate 通过，得到 ${JSON.stringify(
            parsed.data
          )}，并将助手回复 addMessage 写回会话。`
        : `parseAndValidate 失败: ${parsed.errors.join("; ")}，未写回会话。`
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
