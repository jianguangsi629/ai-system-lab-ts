import type { ChatRequest, ChatResult, ProviderName } from "../types.js";

export interface LLMProvider {
  name: ProviderName;
  chat(request: ChatRequest): Promise<ChatResult>;
}

export class ProviderError extends Error {
  readonly provider: ProviderName;
  readonly status?: number;
  readonly code?: string;

  constructor(options: {
    provider: ProviderName;
    message: string;
    status?: number;
    code?: string;
  }) {
    super(options.message);
    this.name = "ProviderError";
    this.provider = options.provider;
    this.status = options.status;
    this.code = options.code;
  }
}
