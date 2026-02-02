# Stage 2：Output Control

目标：通过 JSON Schema 强制结构化输出，并将 LLM 视为不可信计算节点。

依赖：Stage 0 Model Gateway、Stage 1 Context Engine。

## 设计思路

- **LLM 为不可信节点**：模型返回的原始文本一律先解析、再校验，不直接信任。
- **结构化输出**：用 JSON Schema 约束期望形状；解析失败或校验失败时返回明确错误，便于重试或降级。
- **解析策略**：支持从 Markdown 代码块（如 \`\`\`json ... \`\`\`）中抽取 JSON，或从正文中提取第一个 JSON 对象/数组，以兼容模型附带说明文字的情况。

## 架构示意

```
  [User / App]
       |
       v
  [Context Engine] --> messages
       |
       v
  [Model Gateway] --> raw content (string)
       |
       v
  [Output Controller]
       |-- extract JSON (strip markdown, first object/array)
       |-- validate against JSON Schema (ajv)
       v
  ParseResult<T> | { success: false, errors }
```

## 模块说明

| 文件                | 职责                                                             |
| ------------------- | ---------------------------------------------------------------- |
| `src/types.ts`      | JsonSchema、ParseResult、ValidationResult、OutputController 类型 |
| `src/parse.ts`      | 从原始内容中抽取 JSON 字符串（代码块、首对象/数组）              |
| `src/validate.ts`   | 使用 ajv 按 JSON Schema 校验                                     |
| `src/controller.ts` | createOutputController，对外提供 parseAndValidate                |

## 使用方式

```ts
import { createOutputController } from "./src/index.js";

const controller = createOutputController({ stripMarkdownCodeBlock: true });

const result = controller.parseAndValidate<MyType>(llmContent, {
  schema: myJsonSchema,
});

if (result.success) {
  // result.data 已通过 schema 校验
} else {
  // result.errors 为解析或校验错误信息
}
```

## 运行示例

在项目根目录执行：

```bash
npm run stage:2
```

会执行 `stages/stage-2-output-control/examples/basic-usage.ts`：先对本地字符串做解析/校验演示，再串联 Context Engine + Gateway 请求一次结构化输出并校验。

## 状态

已实现：解析（含 Markdown 代码块）、JSON Schema 校验（ajv）、Output Controller 封装与 basic-usage 示例。
