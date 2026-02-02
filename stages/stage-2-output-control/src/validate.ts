/**
 * Validate parsed data against JSON Schema (using ajv).
 */

import AjvImport, { type ErrorObject } from "ajv";
import type { JsonSchema, ValidationResult } from "./types.js";

const AjvConstructor = (
  typeof AjvImport === "function"
    ? AjvImport
    : (
        AjvImport as unknown as {
          default: new (opts?: { allErrors?: boolean }) => AjvInstance;
        }
      ).default
) as new (opts?: { allErrors?: boolean }) => AjvInstance;

interface AjvInstance {
  validate(schema: JsonSchema, data: unknown): boolean;
  errors?: ErrorObject[] | null;
}

function formatAjvErrors(errors: ErrorObject[] | undefined): string[] {
  if (!errors || errors.length === 0) {
    return [];
  }
  return errors.map(
    (e) =>
      `${e.instancePath || "/"} ${e.message ?? e.keyword}${
        e.params ? ` (${JSON.stringify(e.params)})` : ""
      }`
  );
}

/**
 * Validate data against a JSON Schema. Returns validation result with errors if invalid.
 */
export function validateAgainstSchema(
  data: unknown,
  schema: JsonSchema
): ValidationResult {
  const ajv = new AjvConstructor({ allErrors: true });
  try {
    const valid = ajv.validate(schema, data);
    if (valid) {
      return { valid: true };
    }
    return {
      valid: false,
      errors: formatAjvErrors(ajv.errors ?? undefined),
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown validation error";
    return { valid: false, errors: [message] };
  }
}
