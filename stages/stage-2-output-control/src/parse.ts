/**
 * Extract JSON from raw LLM content (handles markdown code blocks and trailing text).
 */

export type ExtractResult =
  | { found: true; json: string }
  | { found: false; reason: string };

const CODE_BLOCK_REGEX = /^```(?:json)?\s*\n?([\s\S]*?)\n?```/;
const OBJECT_START = /\{/;
const ARRAY_START = /\[/;

function findMatchingBracketEnd(
  str: string,
  startIndex: number,
  open: string,
  close: string
): number {
  let depth = 0;
  let i = startIndex;
  const len = str.length;
  while (i < len) {
    const c = str[i];
    if (c === "\\" && i + 1 < len) {
      i += 2;
      continue;
    }
    if (c === open) {
      depth++;
    } else if (c === close) {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
    i++;
  }
  return -1;
}

/**
 * Strip optional markdown code block (```json ... ``` or ``` ... ```) and return inner text.
 */
function stripMarkdownCodeBlock(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(CODE_BLOCK_REGEX);
  if (match) {
    return match[1].trim();
  }
  return trimmed;
}

/**
 * Extract first JSON object or array from text (handles trailing explanation).
 */
function extractFirstJson(text: string): ExtractResult {
  const objMatch = text.match(OBJECT_START);
  const arrMatch = text.match(ARRAY_START);
  const objIndex = objMatch ? objMatch.index! : -1;
  const arrIndex = arrMatch ? arrMatch.index! : -1;

  let startIndex: number;
  let endIndex: number;
  if (objIndex >= 0 && (arrIndex < 0 || objIndex <= arrIndex)) {
    startIndex = objIndex;
    endIndex = findMatchingBracketEnd(text, startIndex, "{", "}");
  } else if (arrIndex >= 0) {
    startIndex = arrIndex;
    endIndex = findMatchingBracketEnd(text, startIndex, "[", "]");
  } else {
    return { found: false, reason: "No JSON object or array found in content" };
  }

  if (endIndex < 0) {
    return { found: false, reason: "Unclosed JSON bracket" };
  }

  const json = text.slice(startIndex, endIndex + 1);
  return { found: true, json };
}

/**
 * Extract JSON string from raw LLM content.
 * If stripMarkdown is true, first strips ```json ... ``` wrapper.
 */
export function extractJson(
  content: string,
  stripMarkdown: boolean = true
): ExtractResult {
  const text = stripMarkdown ? stripMarkdownCodeBlock(content) : content.trim();
  if (!text) {
    return { found: false, reason: "Empty content after strip" };
  }
  return extractFirstJson(text);
}
