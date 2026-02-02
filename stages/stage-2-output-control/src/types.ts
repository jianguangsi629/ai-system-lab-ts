/**
 * Stage 2 Output Control types.
 * LLM is treated as untrusted: all output is parsed and validated before use.
 */

/** JSON Schema (draft-07 style) for constraining structured output. */
export type JsonSchema = Record<string, unknown>;

/** Result of parsing raw LLM content into JSON. */
export type ParseResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; errors: string[]; raw?: string };

/** Result of validating parsed data against a schema. */
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/** Options for parsing and validating structured output. */
export interface ParseAndValidateOptions {
  /** JSON Schema to validate against. If omitted, only JSON parse is performed. */
  schema?: JsonSchema;
  /** If true, strip markdown code blocks (e.g. ```json ... ```) before parsing. */
  stripMarkdownCodeBlock?: boolean;
}

/** Configuration for the output controller. */
export interface OutputControllerConfig {
  /** Max retries when output fails validation (optional). */
  maxParseRetries?: number;
  /** Whether to strip ```json ... ``` from content before parsing (default true). */
  stripMarkdownCodeBlock?: boolean;
}

/** Output controller: parse and validate LLM content. */
export interface OutputController {
  /**
   * Extract JSON from raw content and optionally validate against schema.
   * Treats LLM output as untrusted; returns errors on parse or validation failure.
   */
  parseAndValidate<T = unknown>(
    content: string,
    options?: ParseAndValidateOptions
  ): ParseResult<T>;
}
