export type ProviderName = "google" | "glm" | "deepseek";

export type Role = "system" | "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface ChatRequest {
  model?: string;
  provider?: ProviderName;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  requestId?: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostEstimate {
  inputCents: number;
  outputCents: number;
  totalCents: number;
  currency: "USD";
}

export interface ChatResult {
  content: string;
  role: "assistant";
  usage?: Usage;
  finishReason?: string;
  /**
   * 原始响应仅用于调试/审计/回放，Gateway 不解释其中含义。
   */
  raw?: unknown;
  cost?: CostEstimate;
  model?: string;
  provider?: ProviderName;
  requestId?: string;
}

export interface RetryOptions {
  maxRetries: number;
  backoffMs: number;
  maxBackoffMs?: number;
  jitter?: number;
}

export interface RequestLog {
  timestamp: string;
  requestId: string;
  model: string;
  provider: ProviderName;
  messageCount: number;
  timeoutMs?: number;
}

export interface ResponseLog {
  timestamp: string;
  requestId: string;
  model: string;
  provider: ProviderName;
  durationMs: number;
  usage?: Usage;
  finishReason?: string;
  cost?: CostEstimate;
}

export interface ErrorLog {
  timestamp: string;
  requestId: string;
  model: string;
  provider: ProviderName;
  durationMs: number;
  error: {
    name: string;
    message: string;
    status?: number;
    code?: string;
  };
}

export interface RequestLogger {
  logRequest(entry: RequestLog): void;
  logResponse(entry: ResponseLog): void;
  logError(entry: ErrorLog): void;
}

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface GoogleConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface GLMConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface ProviderConfig {
  google?: GoogleConfig;
  glm?: GLMConfig;
  deepseek?: DeepSeekConfig;
}

export interface CostTableEntry {
  inputCentsPer1k: number;
  outputCentsPer1k: number;
  currency?: "USD";
}

export type CostTable = Record<string, CostTableEntry>;

export interface GatewayConfig {
  providers: ProviderConfig;
  defaultModel?: string;
  modelProviderMap?: Record<string, ProviderName>;
  fallbackModels?: string[];
  retry?: RetryOptions;
  timeoutMs?: number;
  logger?: RequestLogger;
  costTable?: CostTable;
}
