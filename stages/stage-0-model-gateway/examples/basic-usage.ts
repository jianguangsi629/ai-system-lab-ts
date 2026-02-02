import {
  buildProviderConfigFromModelMaps,
  createModelGateway,
  getDefaultModelFromMaps,
  getFallbackModelsFromMaps,
  getModelProviderMapFromMaps,
} from "../src/index.js";

async function main() {
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
  });

  const result = await gateway.chat({
    messages: [
      {
        role: "user",
        content: "Summarize why a model gateway is useful in one paragraph.",
      },
    ],
    temperature: 0.2,
  });

  console.log("Assistant:", result.content);
  if (result.usage) {
    console.log("Usage:", result.usage);
  }
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
