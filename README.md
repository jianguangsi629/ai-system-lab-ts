# AI System Lab

From API Calls to Autonomous Agents

## 目标

AI System Lab 是一个生产级、分阶段演进的 LLM 系统学习项目，强调系统架构的逐层构建，而不是 Demo。涵盖：

- LLM API 接入
- 上下文与记忆系统
- 结构化输出控制
- 工具/函数调用
- Agent 规划与执行
- Manus/Devin 风格产品的底层架构基础

## 阶段

- Stage 0：Model Gateway — 统一模型接入层
- Stage 1：Context Engine — session、历史与记忆
- Stage 2：Output Control — 结构化输出与校验
- Stage 3：Tool System — 工具注册与调用
- Stage 4：Agent Core — 规划、执行、恢复
- Stage 5：Manus Architecture — 多 Agent、HITL 与审计

## 运行 Stage 0

1. 复制 `.env.example` 到 `.env` 并填写 API Key。
2. 构建并运行：

```
npm run stage:0
```

Stage 0 文档：`stages/stage-0-model-gateway/README.md`
