import type { GLMConfig } from "../types.js";
import { createOpenAICompatibleProvider } from "./openai.js";
import type { LLMProvider } from "./types.js";

const DEFAULT_GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

export function createGLMProvider(config: GLMConfig): LLMProvider {
  return createOpenAICompatibleProvider("glm", config, DEFAULT_GLM_BASE_URL);
}
