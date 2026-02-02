import { createDefaultCostTable, estimateCost } from "./cost.js";
import { createConsoleLogger } from "./logger.js";
import { createDeepSeekProvider } from "./providers/deepseek.js";
import { createGLMProvider } from "./providers/glm.js";
import { createGoogleProvider } from "./providers/google.js";
import type { LLMProvider } from "./providers/types.js";
import { withRetry } from "./retry.js";
import type {
  ChatRequest,
  ChatResult,
  GatewayConfig,
  ProviderName,
  RequestLogger,
} from "./types.js";

const DEFAULT_MODEL_PROVIDER_MAP: Record<string, ProviderName> = {
  "gemini-2.5-flash": "google",
  "gemini-2.0-flash": "google",
  "gemini-1.5-flash": "google",
  "glm-4.7": "glm",
  "glm-4-flash": "glm",
  "glm-4": "glm",
  "glm-4-plus": "glm",
  "glm-4-air": "glm",
  "glm-4-long": "glm",
  "deepseek-chat": "deepseek",
  "deepseek-reasoner": "deepseek",
};

function resolveTimeout(
  request: ChatRequest,
  config: GatewayConfig
): number | undefined {
  const requestTimeout = request.timeoutMs ?? Number.POSITIVE_INFINITY;
  const configTimeout = config.timeoutMs ?? Number.POSITIVE_INFINITY;
  const min = Math.min(requestTimeout, configTimeout);
  return Number.isFinite(min) ? min : undefined;
}

function createMergedSignal(
  abortSignal: AbortSignal | undefined,
  timeoutMs: number | undefined
): { signal?: AbortSignal; cancel?: () => void } {
  if (!abortSignal && !timeoutMs) {
    return {};
  }

  const controller = new AbortController();
  let timeoutId: NodeJS.Timeout | undefined;

  if (timeoutMs) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  if (abortSignal) {
    if (abortSignal.aborted) {
      controller.abort();
    } else {
      abortSignal.addEventListener(
        "abort",
        () => {
          controller.abort();
        },
        { once: true }
      );
    }
  }

  return {
    signal: controller.signal,
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
}

function buildProviderRegistry(
  config: GatewayConfig
): Map<ProviderName, LLMProvider> {
  const registry = new Map<ProviderName, LLMProvider>();

  if (config.providers.google) {
    registry.set("google", createGoogleProvider(config.providers.google));
  }
  if (config.providers.glm) {
    registry.set("glm", createGLMProvider(config.providers.glm));
  }
  if (config.providers.deepseek) {
    registry.set("deepseek", createDeepSeekProvider(config.providers.deepseek));
  }

  return registry;
}

function resolveProviderName(
  model: string,
  explicitProvider: ProviderName | undefined,
  modelProviderMap: Record<string, ProviderName>
): ProviderName {
  if (explicitProvider) {
    return explicitProvider;
  }

  const provider = modelProviderMap[model];
  if (!provider) {
    throw new Error(`No provider mapping found for model: ${model}`);
  }

  return provider;
}

function ensureProvider(
  registry: Map<ProviderName, LLMProvider>,
  providerName: ProviderName
): LLMProvider {
  const provider = registry.get(providerName);
  if (!provider) {
    throw new Error(`Provider not configured: ${providerName}`);
  }
  return provider;
}

function createLogger(config: GatewayConfig): RequestLogger {
  if (config.logger) {
    return config.logger;
  }
  return createConsoleLogger("info");
}

export function createModelGateway(config: GatewayConfig) {
  const modelProviderMap = {
    ...DEFAULT_MODEL_PROVIDER_MAP,
    ...(config.modelProviderMap ?? {}),
  };
  const registry = buildProviderRegistry(config);
  const logger = createLogger(config);
  const costTable = config.costTable ?? createDefaultCostTable();

  async function chat(request: ChatRequest): Promise<ChatResult> {
    const model = request.model ?? config.defaultModel;
    if (!model) {
      throw new Error(
        "Model is required. Provide request.model or config.defaultModel."
      );
    }

    const modelsToTry = [model, ...(config.fallbackModels ?? [])];
    const timeoutMs = resolveTimeout(request, config);
    const requestId = request.requestId ?? crypto.randomUUID();

    let lastError: unknown;

    for (const candidate of modelsToTry) {
      const providerName = resolveProviderName(
        candidate,
        request.provider,
        modelProviderMap
      );
      const provider = ensureProvider(registry, providerName);
      const attemptStart = Date.now();

      logger.logRequest({
        timestamp: new Date().toISOString(),
        requestId,
        model: candidate,
        provider: providerName,
        messageCount: request.messages.length,
        timeoutMs,
      });

      try {
        const attempt = async () => {
          const { signal, cancel } = createMergedSignal(
            request.abortSignal,
            timeoutMs
          );
          try {
            return await provider.chat({
              ...request,
              model: candidate,
              provider: providerName,
              requestId,
              abortSignal: signal,
            });
          } finally {
            if (cancel) {
              cancel();
            }
          }
        };

        const result = await withRetry(attempt, config.retry);

        const durationMs = Date.now() - attemptStart;

        logger.logResponse({
          timestamp: new Date().toISOString(),
          requestId,
          model: candidate,
          provider: providerName,
          durationMs,
          usage: result.usage,
          finishReason: result.finishReason,
        });

        const cost = estimateCost(result.usage, candidate, costTable);
        const finalResult: ChatResult = {
          ...result,
          cost,
          model: candidate,
          provider: providerName,
          requestId,
        };

        return finalResult;
      } catch (error) {
        const durationMs = Date.now() - attemptStart;
        lastError = error;

        logger.logError({
          timestamp: new Date().toISOString(),
          requestId,
          model: candidate,
          provider: providerName,
          durationMs,
          error: {
            name: (error as { name?: string }).name ?? "Error",
            message: (error as { message?: string }).message ?? "Unknown error",
            status: (error as { status?: number }).status,
            code: (error as { code?: string }).code,
          },
        });
      } finally {
        // 单次尝试的清理在 retry 包装内部完成
      }
    }

    throw (
      lastError ?? new Error("Model Gateway failed without an explicit error.")
    );
  }

  return { chat };
}
