/**
 * Tool Registry: register tools by name, list for prompt/API, execute by name.
 */

import type { Tool, ToolRegistry as IToolRegistry } from "./types.js";

export function createToolRegistry(): IToolRegistry {
  const tools = new Map<string, Tool>();

  return {
    register(tool: Tool): void {
      if (!tool.name?.trim()) {
        throw new Error("Tool name is required");
      }
      tools.set(tool.name.trim(), tool);
    },

    get(name: string): Tool | undefined {
      return tools.get(name);
    },

    list(): Tool[] {
      return Array.from(tools.values());
    },

    async execute(
      name: string,
      args: Record<string, unknown>
    ): Promise<unknown> {
      const tool = tools.get(name);
      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }
      return tool.execute(args as never);
    },
  };
}
