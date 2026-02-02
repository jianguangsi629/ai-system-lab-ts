import type { RetryOptions } from "./types.js";
import { ProviderError } from "./providers/types.js";

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 2,
  backoffMs: 300,
  maxBackoffMs: 2000,
  jitter: 0.2,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withJitter(value: number, jitter: number): number {
  const delta = value * jitter;
  return value + (Math.random() * 2 - 1) * delta;
}

export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if (error instanceof ProviderError) {
    const status = (error as ProviderError).status ?? 0;
    return status === 429 || status >= 500;
  }

  const name = (error as { name?: string }).name;
  if (name === "AbortError") {
    return true;
  }

  const code = (error as { code?: string }).code;
  if (code) {
    return ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN"].includes(code);
  }

  return false;
}

// retry 仅负责策略包装，超时等机制由调用方注入
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const retry = { ...DEFAULT_RETRY, ...(options ?? {}) };
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (attempt > retry.maxRetries || !isRetryableError(error)) {
        throw error;
      }

      const rawBackoff = retry.backoffMs * Math.pow(2, attempt - 1);
      const cappedBackoff = Math.min(
        rawBackoff,
        retry.maxBackoffMs ?? rawBackoff
      );
      const delay = retry.jitter
        ? withJitter(cappedBackoff, retry.jitter)
        : cappedBackoff;
      await sleep(Math.max(0, delay));
    }
  }
}
