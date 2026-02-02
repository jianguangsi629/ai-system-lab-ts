# Stage 3：Tool System

目标：定义 Tool / Function 抽象、工具注册中心，实现「LLM 决策是否调用工具」与「工具执行结果回注给模型」。

依赖：Stage 0 Model Gateway、Stage 1 Context Engine、Stage 2 Output Control。

## 设计思路

- **Tool 抽象**：每个工具包含 name、description、parameters（JSON Schema）、execute 函数；与具体 LLM API 的 function calling 格式解耦，便于迁移。
- **Tool Registry**：集中注册与按名查找；对外可提供「供 prompt 描述」或未来「供 API tools 数组」的列表。
- **LLM 决策**：当前采用「结构化输出」方式：在 system prompt 中描述可用工具，要求模型仅返回 JSON，形如 `{ "tool": "name", "arguments": {...} }` 或 `{ "tool": null, "reply": "..." }`；由 Stage 2 的 Output Controller 解析并校验。
- **结果回注**：解析出 tool 调用后执行工具，将结果以一条 user 消息形式追加到会话，再请求模型，形成多轮「模型 → 解析 → 执行 → 回注」直到模型返回 `tool: null` 或达到最大轮数。

## 架构示意

```
  [User / App]
       |
       v
  [Tool Registry]  <-- register(tool)
       |
       v (list tools -> system prompt)
  [Context Engine] --> messages (system + user + assistant + tool-result as user)
       |
       v
  [Model Gateway] --> raw content (JSON string)
       |
       v
  [Output Controller] --> parse & validate ToolDecisionOutput
       |
       +-- tool: null --> done (reply to user)
       +-- tool: "name" --> [Tool Registry].execute(name, args)
                                |
                                v
                           inject "[Tool result for name]\n..." as user message
                                |
                                v
                           next round (Context Engine -> Gateway -> ...)
```

## 模块说明

| 文件              | 职责                                                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`    | Tool、ToolCall、ToolResult、ToolDecisionOutput、ToolRegistry、TOOL_DECISION_SCHEMA                                          |
| `src/registry.ts` | createToolRegistry：注册、按名获取、列表、按名执行                                                                          |
| `src/runner.ts`   | buildToolSystemPrompt、parseToolDecision、executeToolCall、runToolLoop（串联 Gateway / Context Engine / Output Controller） |

## 使用方式

```ts
import { createToolRegistry, runToolLoop, createOutputController } from "...";

const registry = createToolRegistry();
registry.register({
  name: "get_weather",
  description: "Get current weather for a city",
  parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  execute: async (args) => ({ temp: 22, city: args.city }),
});

const deps = {
  chat: gateway.chat.bind(gateway),
  contextEngine,
  outputController: createOutputController(),
  toolRegistry: registry,
};

const result = await runToolLoop(deps, sessionId, "What's the weather in Beijing?", {
  maxToolRounds: 5,
});
console.log(result.reply);
```

## 运行示例

在项目根目录执行：

```bash
npm run stage:3
```

会执行 `stages/stage-3-tool-system/examples/basic-usage.ts`：注册若干工具，通过 prompt-based 工具循环完成一次「用户提问 → 模型决定调用工具 → 执行 → 回注 → 模型回复」的完整流程。

## 状态

已实现：Tool 抽象与 Registry、prompt-based 工具决策与执行、结果回注循环（runToolLoop）、basic-usage 示例。若网关后续支持原生 tool_calls（如 OpenAI function calling），可在此层替换为「原生请求 + 按 tool_calls 执行 + 回注」流程。
