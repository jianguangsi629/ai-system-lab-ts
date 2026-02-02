/**
 * Stage 0 Model Gateway 基础用法：
 * 从全局配置组装 Gateway，发一次 chat 请求，展示返回的 content / usage / cost。
 */

import {
  buildProviderConfigFromModelMaps,
  createModelGateway,
  getDefaultModelFromMaps,
  getFallbackModelsFromMaps,
  getModelProviderMapFromMaps,
} from "../src/index.js";

async function main() {
  // 从环境变量/配置生成各厂商 API 配置、默认模型、模型→厂商映射、降级模型列表
  const providers = buildProviderConfigFromModelMaps();
  const defaultModel = getDefaultModelFromMaps();
  const modelProviderMap = getModelProviderMapFromMaps();
  const fallbackModels = getFallbackModelsFromMaps().filter(
    (m) => m !== defaultModel
  );

  // 创建 Gateway 实例：超时 20s，重试 2 次、退避 400ms、带 jitter
  const gateway = createModelGateway({
    providers,
    defaultModel,
    modelProviderMap,
    fallbackModels,
    timeoutMs: 20000,
    retry: { maxRetries: 2, backoffMs: 400, maxBackoffMs: 2000, jitter: 0.2 },
  });

  // 发一次 chat：单条 user 消息，低 temperature
  const result = await gateway.chat({
    messages: [
      {
        role: "user",
        content: "Summarize why a model gateway is useful in one paragraph.",
      },
    ],
    temperature: 0.2,
  });

  // 打印助手回复
  console.log("Assistant:", result.content);
  // 若有 token 统计则打印
  if (result.usage) {
    console.log("Usage:", result.usage);
  }
  // 若有成本估算则打印（input/output/total cents）
  if (result.cost) {
    const c = result.cost;
    console.log("Cost estimate (cents):", {
      inputCents: c.inputCents,
      outputCents: c.outputCents,
      totalCents: c.totalCents,
      currency: c.currency,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
