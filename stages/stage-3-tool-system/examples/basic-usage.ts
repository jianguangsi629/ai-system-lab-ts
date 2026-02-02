/**
 * Stage 3 Tool System 基础用法：
 * - 使用 Stage 0 Gateway + Stage 1 Context Engine + Stage 2 Output Controller
 * - 注册若干工具（get_weather、get_time）
 * - 通过 prompt-based 工具循环：用户提问 -> 模型决定是否调用工具 -> 执行 -> 回注 -> 直到模型返回最终回复
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
import { createToolRegistry, runToolLoop, type Tool } from "../src/index.js";

// ---------- 工具定义 ----------

/** 模拟天气工具：根据城市返回假数据 */
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
    // 模拟查询：固定返回假数据
    const temp = 18 + Math.floor(Math.random() * 10);
    return { city: args.city, temp, unit: "celsius" };
  },
};

/** 模拟当前时间工具 */
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

async function main() {
  // ---------- 第一段：仅 Registry + 本地执行（不调模型）----------
  const registry = createToolRegistry();
  registry.register(getWeatherTool);
  registry.register(getTimeTool);

  console.log(
    "Registered tools:",
    registry.list().map((t) => t.name)
  );

  const weatherResult = await registry.execute("get_weather", {
    city: "Beijing",
  });
  console.log("Direct tool call get_weather(Beijing):", weatherResult);

  const timeResult = await registry.execute("get_time", {});
  console.log("Direct tool call get_time():", timeResult);

  // ---------- 第二段：完整流水线（Context Engine + Gateway + Output Controller + Tool Loop）----------
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
  });

  const outputController = createOutputController({
    stripMarkdownCodeBlock: true,
  });

  const deps = {
    chat: gateway.chat.bind(gateway),
    contextEngine: engine,
    outputController,
    toolRegistry: registry,
  };

  // 用户提问：希望模型决定调用 get_weather 或直接回答
  const userMessage =
    "What is the weather in Shanghai? Reply in one short sentence.";
  console.log("\nUser:", userMessage);

  const result = await runToolLoop(deps, sessionId, userMessage, {
    maxToolRounds: 5,
    temperature: 0.1,
    maxTokens: 500,
  });

  if (result.reply !== undefined) {
    console.log("Assistant reply:", result.reply);
  } else {
    console.log(
      "No final reply; last raw content:",
      result.lastRawContent?.slice(0, 200)
    );
  }
  console.log("Tool rounds executed:", result.toolRounds);
  if (result.maxRoundsReached) {
    console.log("(Max tool rounds reached)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
