# Stage 1：Context Engine

目标：管理对话历史、session 边界、上下文窗口裁剪与摘要记忆。

依赖：Stage 0 Model Gateway。

## 系统设计

```
┌─────────────────────────────────────────────────────────┐
│                    Context Engine                        │
├─────────────────────────────────────────────────────────┤
│  Session Store (id → Session)                            │
│    Session: messages[], summary?, createdAt, updatedAt   │
├─────────────────────────────────────────────────────────┤
│  addMessage(sessionId, message)                          │
│  getMessagesForRequest(sessionId, options?)               │
│    → trim by maxTokens / maxMessages                     │
│    → optional: prepend summary as system message         │
│  setSummary(sessionId, summary) / getSummary(sessionId)  │
├─────────────────────────────────────────────────────────┤
│  Trim: drop_oldest | keep_system_and_recent              │
│  Token estimate: chars/4 (no real tokenizer)             │
└─────────────────────────────────────────────────────────┘
         │
         │ Message[] (system/user/assistant)
         ▼
┌─────────────────────────────────────────────────────────┐
│  Stage 0 Model Gateway (chat with messages)              │
└─────────────────────────────────────────────────────────┘
```

- **Session / Conversation**：以 `sessionId` 区分会话，每个 session 持有一条 `messages` 列表和可选的 `summary`。
- **消息角色**：与 Stage 0 一致，区分 `system` / `user` / `assistant`，`Message` 形状可直接用于 Gateway 的 `chat(messages)`。
- **上下文裁剪**：按 `maxTokens`（估算）或 `maxMessages` 裁剪；策略 `keep_system_and_recent` 优先保留 system 消息与最近若干轮。
- **摘要记忆**：可对历史调用 `setSummary(sessionId, summary)`，`getMessagesForRequest(..., { includeSummaryAsSystem: true })` 时在队首注入一条 system 消息，便于长对话压缩。

## 如何运行

在项目根目录执行：

```bash
npm run stage:1
```

会先执行 `npm run build`，再运行 `stages/stage-1-context-engine/examples/basic-usage.js`。示例会创建 Context Engine、写入若干条消息、演示裁剪与 summary 注入，并可选地调用 Stage 0 Gateway 获取回复并写回 context。

## 状态

已实现：Session 管理、消息历史、按 token/条数裁剪、摘要记忆、与 Stage 0 联调示例。
