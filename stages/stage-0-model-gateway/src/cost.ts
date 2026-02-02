import type { CostEstimate, CostTable, Usage } from "./types.js";

export function estimateCost(
  usage: Usage | undefined,
  model: string,
  costTable: CostTable
): CostEstimate | undefined {
  if (!usage) {
    return undefined;
  }

  const entry = costTable[model];
  if (!entry) {
    return undefined;
  }

  const rawInput = (usage.inputTokens / 1000) * entry.inputCentsPer1k;
  const rawOutput = (usage.outputTokens / 1000) * entry.outputCentsPer1k;
  const round2 = (x: number) => Math.round(x * 100) / 100;
  const inputCents = round2(rawInput);
  const outputCents = round2(rawOutput);
  const totalCents = round2(inputCents + outputCents);

  return {
    inputCents,
    outputCents,
    totalCents,
    currency: entry.currency ?? "USD",
  };
}

export function createDefaultCostTable(): CostTable {
  return {
    "gemini-2.5-flash": { inputCentsPer1k: 0.075, outputCentsPer1k: 0.3 },
    "gemini-2.0-flash": { inputCentsPer1k: 0.1, outputCentsPer1k: 0.4 },
    "gemini-1.5-flash": { inputCentsPer1k: 0.075, outputCentsPer1k: 0.3 },
    "glm-4.7": { inputCentsPer1k: 0.15, outputCentsPer1k: 0.15 },
    "glm-4-flash": { inputCentsPer1k: 0.05, outputCentsPer1k: 0.15 },
    "glm-4": { inputCentsPer1k: 0.1, outputCentsPer1k: 0.1 },
    "glm-4-plus": { inputCentsPer1k: 0.2, outputCentsPer1k: 0.2 },
    "glm-4-air": { inputCentsPer1k: 0.03, outputCentsPer1k: 0.03 },
    "glm-4-long": { inputCentsPer1k: 0.1, outputCentsPer1k: 0.1 },
    "deepseek-chat": { inputCentsPer1k: 0.14, outputCentsPer1k: 0.28 },
    "deepseek-reasoner": { inputCentsPer1k: 0.55, outputCentsPer1k: 1.1 },
  };
}
