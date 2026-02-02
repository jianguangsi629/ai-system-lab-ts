你现在扮演我的「AI 平台架构师 + 资深 TypeScript 工程师」。

我们要从 0 到 1 构建一个 **生产级的 LLM 系统学习项目**，项目名为：

AI System Lab
副标题：From API Calls to Autonomous Agents

【目标】
这个项目不是 Demo，也不是简单聊天机器人，而是一个「逐层演进的 AI 系统架构实验室」，用于系统性理解：
- LLM API 接入
- 上下文与记忆系统
- 输出控制与结构化结果
- 工具（Function / API）调用机制
- Agent 的规划与执行
- 最终理解 Manus / Devin 这一类 AI 产品的底层架构原理

【技术栈】
- TypeScript
- Node.js
- 可被 Next.js / Vercel 调用（但不强依赖）
- 架构需保持「语言无关」，未来可迁移到 Python

【整体架构要求】
请将项目设计为「分阶段演进的系统」，而不是一堆示例代码。

阶段划分如下：

Stage 0：Model Gateway（模型接入层）
- 统一封装 LLM API（如 OpenAI / Claude / DeepSeek）
- 支持模型切换
- 支持超时、重试、失败兜底
- 记录请求日志、token 使用量、成本估算
- 明确这是“基础设施层”，而不是业务代码

Stage 1：Context Engine（上下文与记忆系统）
- 管理对话历史
- 实现上下文窗口裁剪
- 支持摘要压缩（summary memory）
- 区分 system / user / assistant 消息
- 支持 session / conversation 概念

Stage 2：Output Control（输出控制层）
- 强制结构化输出（JSON Schema）
- 校验模型返回结果
- 处理非法 / 不完整输出
- 将 LLM 视为「不可信计算节点」

Stage 3：Tool System（工具系统）
- 定义 Tool / Function 抽象
- Tool Registry（工具注册中心）
- LLM 决策是否调用工具
- 工具执行结果回注给模型

Stage 4：Agent Core（Agent 核心）
- 任务拆解（Planning）
- 多步执行（Execution）
- 中间状态与失败恢复
- Memory 写回

Stage 5：Manus Architecture（产品级系统）
- 多 Agent 协作
- 人类介入（Human-in-the-loop）
- 权限、成本、审计日志
- 用于理解 Manus / Devin / AI OS 的架构模式

【工程要求】
- 每一个 Stage 都是独立可运行的模块
- 每个 Stage 都有 README，重点解释「系统设计思路」，不是只写 how to run
- 每一个 example 的代码要加上代码中文注释，解释主要的含义
- 使用清晰的目录结构和命名
- 避免框架魔法，优先显式代码
- 在 README 中使用 ASCII 图表示架构
- 所有与“人”的沟通用简体中文，且以「[ 道友 ]:」开头。
- 注释与文档用中文；代码、API 名、日志用英文。

请以「系统架构清晰、可扩展、可迁移」为第一优先级。
