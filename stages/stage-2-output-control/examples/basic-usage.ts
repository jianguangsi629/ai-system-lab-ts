/**
 * Stage 2 Output Control 基础用法：
 * - 使用 Stage 0 Gateway + Stage 1 Context Engine
 * - 要求模型返回结构化 JSON
 * - 用 Output Controller 解析并校验 LLM 输出（LLM 视为不可信节点）
 * - 处理解析/校验失败的情况
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

async function main() {
  const outputController = createOutputController({
    stripMarkdownCodeBlock: true,
  });

  // ---------- 第一段：本地「好」样例（不调模型）----------
  // 模拟模型返回的「正确」格式：带 ```json ... ``` 的合法 JSON，解析+校验应通过
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
  // 模拟模型乱写类型：age 为字符串，校验应失败，体现「不信任 raw」
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
  const engine = createContextEngine({
    maxTokens: 2000,
    maxMessages: 20,
    trimStrategy: "keep_system_and_recent",
  });

  const sessionId = engine.createSession();
  // 系统提示：只返回 JSON，且形状为 { name, age }
  const systemPrompt = `You are a helpful assistant. Extract structured data from the user's message.
Respond with a single JSON object only, no other text. Use this shape: { "name": string, "age": number }.
Example: {"name": "Alice", "age": 25}`;
  engine.addMessage(sessionId, { role: "system", content: systemPrompt });
  engine.addMessage(sessionId, {
    role: "user",
    content: "My name is Charlie and I am 28 years old.",
  });

  // 组装 Gateway，用于发真实请求
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

  // 取当前会话消息，发一次 chat，拿到模型原始 content
  const messages = engine.getMessagesForRequest(sessionId, {
    includeSummaryAsSystem: false,
  });
  const chatResult = await gateway.chat({
    messages,
    temperature: 0.1,
    maxTokens: 500,
  });

  // 对模型返回的 content 做解析+校验，得到可信的 T 或错误列表
  const parsed = outputController.parseAndValidate<PersonOutput>(
    chatResult.content,
    { schema: PERSON_SCHEMA }
  );

  if (parsed.success) {
    console.log("\nStructured output from LLM:", parsed.data);
    // 校验通过才把助手回复写回会话
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
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
