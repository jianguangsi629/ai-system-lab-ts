import type { DeepSeekConfig } from "../types.js";
import { createOpenAICompatibleProvider } from "./openai.js";
import type { LLMProvider } from "./types.js";

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

export function createDeepSeekProvider(config: DeepSeekConfig): LLMProvider {
  return createOpenAICompatibleProvider(
    "deepseek",
    config,
    DEFAULT_DEEPSEEK_BASE_URL
  );
}
