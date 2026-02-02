/**
 * Context Engine: session storage, message history, trim and summary memory.
 */

import type {
  ContextEngine,
  ContextEngineConfig,
  GetMessagesOptions,
  Message,
  Session,
  TrimStrategy,
} from "./types.js";

/** Approximate tokens from character count (no real tokenizer). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(m: Message): number {
  return 4 + estimateTokens(m.content);
}

function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

function trimDropOldest(
  messages: Message[],
  maxTokens: number | undefined,
  maxMessages: number | undefined
): Message[] {
  let out = [...messages];
  if (maxMessages !== undefined && out.length > maxMessages) {
    out = out.slice(-maxMessages);
  }
  if (maxTokens !== undefined) {
    while (out.length > 1 && totalTokens(out) > maxTokens) {
      out.shift();
    }
  }
  return out;
}

function trimKeepSystemAndRecent(
  messages: Message[],
  maxTokens: number | undefined,
  maxMessages: number | undefined
): Message[] {
  const systemMessages = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  let restTrimmed = trimDropOldest(rest, maxTokens, maxMessages);
  const out = [...systemMessages, ...restTrimmed];
  if (maxTokens !== undefined && totalTokens(out) > maxTokens) {
    return trimDropOldest(out, maxTokens, undefined);
  }
  return out;
}

function trim(
  messages: Message[],
  strategy: TrimStrategy,
  maxTokens: number | undefined,
  maxMessages: number | undefined
): Message[] {
  if (!maxTokens && !maxMessages) {
    return messages;
  }
  if (strategy === "keep_system_and_recent") {
    return trimKeepSystemAndRecent(messages, maxTokens, maxMessages);
  }
  return trimDropOldest(messages, maxTokens, maxMessages);
}

function generateId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export function createContextEngine(
  config: ContextEngineConfig = {}
): ContextEngine {
  const sessions = new Map<string, Session>();
  const {
    maxTokens = 8000,
    maxMessages = 50,
    trimStrategy = "keep_system_and_recent",
  } = config;

  return {
    createSession(sessionId?: string): string {
      const id = sessionId ?? generateId();
      if (sessions.has(id)) {
        return id;
      }
      const now = new Date().toISOString();
      sessions.set(id, {
        id,
        messages: [],
        createdAt: now,
        updatedAt: now,
      });
      return id;
    },

    getSession(sessionId: string): Session | undefined {
      return sessions.get(sessionId);
    },

    addMessage(sessionId: string, message: Message): void {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      session.messages.push(message);
      session.updatedAt = new Date().toISOString();
    },

    getMessagesForRequest(
      sessionId: string,
      options?: GetMessagesOptions
    ): Message[] {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      const includeSummary = options?.includeSummaryAsSystem ?? true;
      const maxTokensOption = options?.maxTokens ?? maxTokens;
      const maxMessagesOption = options?.maxMessages ?? maxMessages;

      let messages = session.messages;
      if (includeSummary && session.summary) {
        messages = [
          {
            role: "system" as const,
            content: `Previous context summary:\n${session.summary}`,
          },
          ...messages,
        ];
      }
      return trim(messages, trimStrategy, maxTokensOption, maxMessagesOption);
    },

    setSummary(sessionId: string, summary: string): void {
      const session = sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }
      session.summary = summary;
      session.updatedAt = new Date().toISOString();
    },

    getSummary(sessionId: string): string | undefined {
      return sessions.get(sessionId)?.summary;
    },
  };
}
