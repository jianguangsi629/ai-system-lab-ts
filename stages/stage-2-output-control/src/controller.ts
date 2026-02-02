/**
 * Output Controller: parse raw LLM content and validate against JSON Schema.
 * Treats LLM as untrusted; all output is validated before use.
 */

import { extractJson } from "./parse.js";
import type {
  JsonSchema,
  OutputController,
  OutputControllerConfig,
  ParseAndValidateOptions,
  ParseResult,
} from "./types.js";
import { validateAgainstSchema } from "./validate.js";

export function createOutputController(
  config: OutputControllerConfig = {}
): OutputController {
  const stripMarkdown = config.stripMarkdownCodeBlock ?? true;

  return {
    parseAndValidate<T = unknown>(
      content: string,
      options?: ParseAndValidateOptions
    ): ParseResult<T> {
      const strip = options?.stripMarkdownCodeBlock ?? stripMarkdown;
      const extract = extractJson(content, strip);
      if (!extract.found) {
        return {
          success: false,
          errors: [extract.reason],
          raw: content.slice(0, 500),
        };
      }

      let data: unknown;
      try {
        data = JSON.parse(extract.json) as unknown;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "JSON parse failed";
        return {
          success: false,
          errors: [msg],
          raw: extract.json.slice(0, 500),
        };
      }

      const schema = options?.schema;
      if (schema) {
        const validation = validateAgainstSchema(data, schema);
        if (!validation.valid) {
          return {
            success: false,
            errors: validation.errors ?? ["Validation failed"],
            raw: extract.json.slice(0, 500),
          };
        }
      }

      return { success: true, data: data as T };
    },
  };
}
