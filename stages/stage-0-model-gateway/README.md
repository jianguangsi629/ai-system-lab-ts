# Stage 0：Model Gateway

From API Calls to Autonomous Agents

## 目标

Stage 0 是基础设施层，统一多厂商 LLM 接入，并提供可靠性与可观测性能力：超时、重试、失败兜底、日志、Token 用量与成本估算。

本阶段不处理：记忆、结构化输出校验、工具调用、Agent 逻辑。

## 架构（ASCII）

```
                    +------------------+
                    |   Application    |
                    +--------+---------+
                             | ChatRequest
                             v
+----------------------------------------------------------------+
|                     Model Gateway (Stage 0)                     |
|  +-----------+  +----------+  +---------+  +------+  +--------+ |
|  | Retry     |  | Timeout  |  | Logger  |  | Cost |  |Provider| |
|  | (wrap)    |->| (Abort)  |->| (in/out)|->| calc |  | select | |
|  +-----------+  +----------+  +---------+  +------+  +----+---+ |
|                                                         |     | |
|  providers: OpenAIAdapter, AnthropicAdapter, DeepSeek   |     | |
+-----------------------------------------------------------------+
                             | HTTP (fetch)
                             v
                    +------------------+
                    |  OpenAI / Claude / DeepSeek API
                    +------------------+
```

## 语义约定（关键）

- **顺序语义**：
  `request -> assign requestId -> withTimeout(withRetry(callProvider)) -> logResponse -> estimateCost`
- **retry 是策略，timeout 是机制**：timeout 是“单次尝试”的超时，retry 是“对一次尝试的包装”。
- **raw 铁律**：`raw` 只负责透传用于 debug/audit/replay，Gateway 不解释 raw，不在该层判断业务含义。

## 核心概念

- 统一消息格式：`system | user | assistant`
- Provider 适配器隔离厂商 API 差异
- 重试 + 超时保护瞬时失败
- 可选 fallback 模型实现降级
- 结构化日志与成本估算便于观测

## 配置

Gateway 通过 `GatewayConfig` 显式配置：

```
const gateway = createModelGateway({
  providers: {
    openai: { apiKey: "..." },
    anthropic: { apiKey: "..." },
    deepseek: { apiKey: "..." }
  },
  defaultModel: "gpt-4o-mini",
  fallbackModels: ["claude-3-haiku-20240307", "deepseek-chat"],
  timeoutMs: 20000,
  retry: { maxRetries: 2, backoffMs: 400, maxBackoffMs: 2000, jitter: 0.2 }
});
```

示例使用的环境变量：

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `DEEPSEEK_API_KEY`
- `GOOGLE_API_KEY`
- `GLM_API_KEY`
- `LOG_LEVEL`（可选，仅当自定义 logger 时使用）

## 使用示例

```
const result = await gateway.chat({
  messages: [
    { role: "user", content: "Explain why a model gateway is useful." }
  ],
  temperature: 0.2
});

console.log(result.content);
```

完整可运行示例见：`examples/basic-usage.ts`。

## 全局配置

Stage 0 提供统一配置读取入口，`config/` 位于仓库根目录，所有 API Key 从配置中获取：

```
const config = loadGlobalConfig();
const providers = buildProviderConfig(config);
```

`GOOGLE_API_KEY` 与 `GLM_API_KEY` 会被加载到全局配置，但当前 Stage 0 仅对已实现的 Provider 生成配置。

## 如何运行

1. 复制 `.env.example` 到 `.env` 并填入至少一个 API Key。
2. 构建并运行：

```
npm run stage:0
```

## 与后续 Stage 的关系

- Stage 1 在此基础上建立 session 与记忆系统
- Stage 2 做结构化输出校验但不改变 Gateway API
- Stage 3+ 以 Gateway 为基础进行工具调用与 Agent 执行
