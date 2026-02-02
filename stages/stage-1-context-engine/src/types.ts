/**
 * Stage 1 Context Engine types.
 * Message shape is compatible with Stage 0 Model Gateway for direct use in chat requests.
 */

export type Role = "system" | "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface Session {
  id: string;
  messages: Message[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

/** How to trim context when over limit: drop oldest messages, or keep system + last N turns. */
export type TrimStrategy = "drop_oldest" | "keep_system_and_recent";

export interface ContextEngineConfig {
  /** Max tokens to keep in context (approximate; uses chars/4 heuristic if no tokenizer). */
  maxTokens?: number;
  /** Max number of messages to keep (after trim). */
  maxMessages?: number;
  /** Which trim strategy to use when over limit. */
  trimStrategy?: TrimStrategy;
  /** When history exceeds this token count, suggest writing a summary (optional hook). */
  summaryThreshold?: number;
}

export interface GetMessagesOptions {
  /** If true, prepend summary as a system message when summary exists. */
  includeSummaryAsSystem?: boolean;
  /** Override max messages for this call (optional). */
  maxMessages?: number;
  /** Override max tokens for this call (optional). */
  maxTokens?: number;
}

export interface ContextEngine {
  createSession(sessionId?: string): string;
  getSession(sessionId: string): Session | undefined;
  addMessage(sessionId: string, message: Message): void;
  getMessagesForRequest(
    sessionId: string,
    options?: GetMessagesOptions
  ): Message[];
  setSummary(sessionId: string, summary: string): void;
  getSummary(sessionId: string): string | undefined;
}
