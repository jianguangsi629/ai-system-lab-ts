import "dotenv/config";

import type {
  ProviderConfig,
  ProviderName,
} from "../stages/stage-0-model-gateway/src/types.js";

export interface ModelMap {
  model: string;
  endpoint: string;
  apiKey?: string;
}

export const GLM_MODEL_MAP: ModelMap = {
  model: "glm-4.7",
  endpoint: "https://open.bigmodel.cn/api/paas/v4",
  apiKey: process.env.GLM_API_KEY,
};

export const DEEPSEEK_MODEL_MAP: ModelMap = {
  model: "deepseek-chat",
  endpoint: "https://api.deepseek.com/v1",
  apiKey: process.env.DEEPSEEK_API_KEY,
};

export const GOOGLE_MODEL_MAP: ModelMap = {
  model: "gemini-2.5-flash",
  endpoint: "https://generativelanguage.googleapis.com/v1beta",
  apiKey: process.env.GOOGLE_API_KEY,
};

const MODEL_MAPS: Record<ProviderName, ModelMap> = {
  google: GOOGLE_MODEL_MAP,
  glm: GLM_MODEL_MAP,
  deepseek: DEEPSEEK_MODEL_MAP,
};

export interface GlobalConfig {
  googleApiKey?: string;
  glmApiKey?: string;
  deepseekApiKey?: string;
  defaultModel?: string;
  logLevel?: string;
}

// 从 .env 读取统一配置，避免在调用处直接读取环境变量
export function loadGlobalConfig(): GlobalConfig {
  return {
    googleApiKey: process.env.GOOGLE_API_KEY,
    glmApiKey: process.env.GLM_API_KEY,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    defaultModel: process.env.DEFAULT_MODEL ?? process.env.defaultModel,
    logLevel: process.env.LOG_LEVEL,
  };
}

// 从 config 的 model map 构建 Provider 配置（apiKey + baseUrl）
export function buildProviderConfigFromModelMaps(): ProviderConfig {
  const providers: ProviderConfig = {};
  if (GOOGLE_MODEL_MAP.apiKey) {
    providers.google = {
      apiKey: GOOGLE_MODEL_MAP.apiKey,
      baseUrl: GOOGLE_MODEL_MAP.endpoint,
    };
  }
  if (GLM_MODEL_MAP.apiKey) {
    providers.glm = {
      apiKey: GLM_MODEL_MAP.apiKey,
      baseUrl: GLM_MODEL_MAP.endpoint,
    };
  }
  if (DEEPSEEK_MODEL_MAP.apiKey) {
    providers.deepseek = {
      apiKey: DEEPSEEK_MODEL_MAP.apiKey,
      baseUrl: DEEPSEEK_MODEL_MAP.endpoint,
    };
  }
  return providers;
}

// 从 config 的 model map 得到 model -> provider 映射（始终包含 config 中的 model，与 apiKey 无关）
export function getModelProviderMapFromMaps(): Record<string, ProviderName> {
  const map: Record<string, ProviderName> = {};
  for (const [providerName, modelMap] of Object.entries(MODEL_MAPS)) {
    if (modelMap.model) {
      map[modelMap.model] = providerName as ProviderName;
    }
  }
  return map;
}

// 从 config 的 model map 得到 fallback 模型列表（有 apiKey 的按 google -> glm -> deepseek）
export function getFallbackModelsFromMaps(): string[] {
  const order: ProviderName[] = ["google", "glm", "deepseek"];
  const models: string[] = [];
  for (const name of order) {
    const modelMap = MODEL_MAPS[name];
    if (modelMap?.apiKey && modelMap.model) {
      models.push(modelMap.model);
    }
  }
  return models;
}

// 从 .env defaultModel 或 config 的 model map 得到默认模型（第一个有 apiKey 的 model）
export function getDefaultModelFromMaps(): string {
  const fromEnv = process.env.DEFAULT_MODEL ?? process.env.defaultModel;
  if (fromEnv?.trim()) {
    return fromEnv.trim();
  }
  const fallbacks = getFallbackModelsFromMaps();
  if (fallbacks.length > 0) {
    return fallbacks[0];
  }
  throw new Error(
    "No API key found. Set GOOGLE_API_KEY, GLM_API_KEY or DEEPSEEK_API_KEY in .env."
  );
}

// 兼容旧用法：从 GlobalConfig 构建 Provider 配置（内部用 model map）
export function buildProviderConfig(_config: GlobalConfig): ProviderConfig {
  return buildProviderConfigFromModelMaps();
}
