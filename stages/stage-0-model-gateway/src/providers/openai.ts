import type { ChatRequest, ChatResult, ProviderName } from "../types.js";
import { ProviderError, type LLMProvider } from "./types.js";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

type OpenAICompatibleConfig = {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
};

function buildHeaders(config: OpenAICompatibleConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
  };

  if (config.organization) {
    headers["OpenAI-Organization"] = config.organization;
  }

  return headers;
}

async function parseErrorMessage(
  response: Response
): Promise<{ message: string; code?: string }> {
  try {
    const payload = await response.json();
    const error = payload?.error;
    if (error?.message) {
      return { message: error.message, code: error.code ?? error.type };
    }
  } catch {
    // 忽略解析错误
  }

  const text = await response.text();
  return { message: text || `Request failed with status ${response.status}` };
}

async function callOpenAICompatible(
  providerName: ProviderName,
  request: ChatRequest,
  config: OpenAICompatibleConfig,
  defaultBaseUrl: string
): Promise<ChatResult> {
  if (!request.model) {
    throw new ProviderError({
      provider: providerName,
      message: "Model is required for OpenAI-compatible providers.",
    });
  }

  if (!config.apiKey) {
    throw new ProviderError({
      provider: providerName,
      message: "API key is required for OpenAI-compatible providers.",
    });
  }

  const baseUrl = config.baseUrl ?? defaultBaseUrl;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    }),
    signal: request.abortSignal,
  });

  if (!response.ok) {
    const errorDetails = await parseErrorMessage(response);
    throw new ProviderError({
      provider: providerName,
      message: errorDetails.message,
      status: response.status,
      code: errorDetails.code,
    });
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const content = choice?.message?.content ?? "";

  return {
    content,
    role: "assistant",
    finishReason: choice?.finish_reason,
    usage: data.usage
      ? {
          inputTokens: data.usage.prompt_tokens ?? 0,
          outputTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : undefined,
    raw: data,
  };
}

export function createOpenAICompatibleProvider(
  providerName: ProviderName,
  config: OpenAICompatibleConfig,
  defaultBaseUrl: string
): LLMProvider {
  return {
    name: providerName,
    chat(request: ChatRequest) {
      return callOpenAICompatible(
        providerName,
        request,
        config,
        defaultBaseUrl
      );
    },
  };
}
