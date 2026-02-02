import type { ChatRequest, ChatResult, GoogleConfig } from "../types.js";
import { ProviderError, type LLMProvider } from "./types.js";

const DEFAULT_GOOGLE_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

function extractSystem(messages: ChatRequest["messages"]): {
  system?: string;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
} {
  const systemParts: string[] = [];
  const contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else {
      const role = message.role === "assistant" ? "model" : "user";
      contents.push({ role, parts: [{ text: message.content }] });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n") : undefined,
    contents,
  };
}

async function parseErrorMessage(
  response: Response
): Promise<{ message: string; code?: string }> {
  try {
    const payload = await response.json();
    const error = payload?.error;
    if (error?.message) {
      return { message: error.message, code: error.code ?? error.status };
    }
  } catch {
    // ignore parse error
  }
  const text = await response.text();
  return {
    message: text || `Request failed with status ${response.status}`,
  };
}

export function createGoogleProvider(config: GoogleConfig): LLMProvider {
  return {
    name: "google",
    async chat(request: ChatRequest): Promise<ChatResult> {
      if (!request.model) {
        throw new ProviderError({
          provider: "google",
          message: "Model is required for Google Gemini.",
        });
      }
      if (!config.apiKey) {
        throw new ProviderError({
          provider: "google",
          message: "API key is required for Google Gemini.",
        });
      }

      const baseUrl = config.baseUrl ?? DEFAULT_GOOGLE_BASE_URL;
      const { system, contents } = extractSystem(request.messages);

      const body: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.maxTokens,
        },
      };
      if (system) {
        body.systemInstruction = { parts: [{ text: system }] };
      }

      const url = `${baseUrl}/models/${
        request.model
      }:generateContent?key=${encodeURIComponent(config.apiKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: request.abortSignal,
      });

      if (!response.ok) {
        const errorDetails = await parseErrorMessage(response);
        throw new ProviderError({
          provider: "google",
          message: errorDetails.message,
          status: response.status,
          code: errorDetails.code,
        });
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      const candidate = data.candidates?.[0];
      const content =
        candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const usage = data.usageMetadata
        ? {
            inputTokens: data.usageMetadata.promptTokenCount ?? 0,
            outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: data.usageMetadata.totalTokenCount ?? 0,
          }
        : undefined;

      return {
        content,
        role: "assistant",
        finishReason: candidate?.finishReason,
        usage,
        raw: data,
      };
    },
  };
}
