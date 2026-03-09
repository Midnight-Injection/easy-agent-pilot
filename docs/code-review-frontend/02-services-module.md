# 前端代码审查报告 - services 模块

> 审查日期: 2026-03-09
> 审查范围: `src/services/`

## 文件概览

| 目录 | 文件 | 行数 | 说明 |
|------|------|------|------|
| **conversation** | | 1386 | 对话服务 |
| | ConversationService.ts | 450 | 对话服务主类 |
| | AgentExecutor.ts | 95 | 智能体执行器 |
| | strategies/types.ts | 264 | 策略类型定义 |
| | strategies/ClaudeCliStrategy.ts | 208 | Claude CLI 策略 |
| | strategies/ClaudeSdkStrategy.ts | 210 | Claude SDK 策略 |
| | strategies/CodexCliStrategy.ts | 193 | Codex CLI 策略 |
| | strategies/CodexSdkStrategy.ts | 210 | Codex SDK 策略 |
| **plan** | | 1178 | 计划服务 |
| | FormEngine.ts | 545 | 动态表单引擎 |
| | ProgressManager.ts | 226 | 进度管理 |
| | TaskSplitOrchestrator.ts | 165 | 任务拆分编排 |
| | prompts.ts | 230 | 提示词模板 |
| **compression** | | 426 | 压缩服务 |
| | CompressionService.ts | 424 | 会话压缩服务 |
| **总计** | | **3240** | |

---

## 架构分析

### 服务层设计

```
┌─────────────────────────────────────────────────────────────┐
│                      Services Layer                         │
├─────────────────────────────────────────────────────────────┤
│  ConversationService (单例)                                 │
│  ├── AgentExecutor (策略注册表)                             │
│  │   ├── ClaudeCliStrategy                                  │
│  │   ├── ClaudeSdkStrategy                                  │
│  │   ├── CodexCliStrategy                                   │
│  │   └── CodexSdkStrategy                                   │
│  └── CompressionService (自动压缩)                          │
├─────────────────────────────────────────────────────────────┤
│  FormEngine (动态表单)                                      │
│  ├── FORM_TEMPLATES (预定义模板)                            │
│  └── Validation (表单验证)                                  │
├─────────────────────────────────────────────────────────────┤
│  TaskSplitOrchestrator (任务拆分编排)                       │
│  └── ProgressManager (进度追踪)                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 问题分析

### 🔴 高优先级问题

#### 1. 单例模式可能导致测试困难

- **位置**: ConversationService.ts L32-44, CompressionService.ts L32-45
- **问题**: 使用 `getInstance()` 单例模式，难以在测试中 mock

```typescript
// 当前代码
static getInstance(): ConversationService {
  if (!ConversationService.instance) {
    ConversationService.instance = new ConversationService()
  }
  return ConversationService.instance
}
```

**建议**: 使用 Vue 的 provide/inject 或依赖注入

```typescript
// 使用 provide/inject
export const ConversationServiceKey = Symbol('ConversationService')

// main.ts
app.provide(ConversationServiceKey, new ConversationService())

// 组件中使用
const service = inject(ConversationServiceKey)
```

#### 2. FormEngine.ts 中的硬编码模板

- **位置**: FormEngine.ts L15-545
- **问题**: 530 行预定义表单模板硬编码在代码中

**建议**: 将模板移到 JSON 配置文件

```
config/form-templates/
├── feature-request.json
├── bug-report.json
├── database-config.json
└── api-config.json
```

### 🟡 中优先级问题

#### 3. 策略类代码高度相似

- **位置**: strategies/ 目录下的 4 个策略文件
- **问题**: ClaudeCliStrategy, ClaudeSdkStrategy, CodexCliStrategy, CodexSdkStrategy 代码结构几乎相同

**相似代码**:
```typescript
// 所有策略都有类似的方法
async execute(context: ExecutionContext): Promise<void> { ... }
abort(): void { ... }
parseEvent(event: string): StreamEvent | null { ... }
```

**建议**: 创建抽象基类

```typescript
// strategies/BaseStrategy.ts
export abstract class BaseStrategy implements AgentStrategy {
  abstract get name(): string

  async execute(context: ExecutionContext): Promise<void> {
    // 公共执行逻辑
    await this.doExecute(context)
  }

  protected abstract doExecute(context: ExecutionContext): Promise<void>

  // 公共的 abort 逻辑
  abort(): void { ... }
}
```

#### 4. ConversationService 职责过多

- **位置**: ConversationService.ts
- **问题**: 450 行，包含消息发送、流式处理、中断处理、可用性检查等多个职责

**建议**: 拆分职责

```
services/conversation/
├── ConversationService.ts      # 主服务 (~150行)
├── StreamEventHandler.ts       # 流式事件处理 (~100行)
├── MessageBuilder.ts           # 消息构建 (~50行)
└── AgentAvailability.ts        # 智能体可用性检查 (~50行)
```

#### 5. 错误处理不一致

- **位置**: 多处
- **问题**: 有些地方抛出错误，有些返回错误对象

```typescript
// ConversationService.ts - 抛出错误
if (!agent) {
  throw new Error('智能体不存在')
}

// CompressionService.ts - 返回错误对象
return {
  success: false,
  error: '没有消息可以压缩',
  // ...
}
```

**建议**: 统一错误处理策略

### 🟢 低优先级问题

#### 6. 魔法字符串

- **位置**: ConversationService.ts L78
- **问题**: 硬编码的会话名称

```typescript
if (session.name === '未命名会话' || session.name.startsWith('新会话')) {
```

**建议**: 定义常量

```typescript
const DEFAULT_SESSION_NAMES = ['未命名会话', '新会话']
```

#### 7. 缺少类型导出

- **位置**: services/index.ts
- **问题**: 类型定义没有统一导出

---

## 设计亮点

### 1. 策略模式应用

```typescript
// AgentExecutor.ts
export class AgentExecutor {
  private strategies: AgentStrategy[] = []

  register(strategy: AgentStrategy) {
    this.strategies.push(strategy)
  }

  isSupported(agent: AgentConfig): boolean {
    return this.strategies.some(s => s.supports(agent))
  }

  async execute(context: ExecutionContext, callback: StreamCallback): Promise<void> {
    const strategy = this.strategies.find(s => s.supports(context.agent))
    if (!strategy) throw new Error('No strategy found')
    return strategy.execute(context, callback)
  }
}
```

### 2. 自动压缩检查

```typescript
// ConversationService.ts
onDone: () => {
  // ... 更新状态 ...
  // 自动压缩检查
  compressionService.checkAndAutoCompress(sessionId, context.agent.id)
}
```

### 3. 兜底状态处理

```typescript
// ConversationService.ts L265-277
// 兜底：部分后端/CLI 场景可能不会显式发出 done 事件
if (sessionExecutionStore.getIsSending(sessionId)) {
  if (!hasError) {
    await messageStore.updateMessage(aiMessage.id, { status: 'completed' })
  }
  sessionExecutionStore.endSending(sessionId)
}
```

### 4. FormEngine 的模板系统

```typescript
export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: 'feature-request',
    name: '功能需求收集',
    schema: {
      formId: 'feature-request',
      fields: [
        { name: 'featureName', type: 'text', required: true },
        // ...
      ]
    }
  }
]
```

---

## 优化建议

### 1. 重构策略模式

```typescript
// strategies/BaseStrategy.ts
export abstract class BaseStrategy implements AgentStrategy {
  constructor(protected readonly eventParser: EventParser) {}

  async execute(context: ExecutionContext, callback: StreamCallback): Promise<void> {
    try {
      const process = await this.spawnProcess(context)
      await this.handleStream(process, callback)
    } catch (error) {
      callback({ type: 'error', error: String(error) })
    }
  }

  protected abstract spawnProcess(context: ExecutionContext): Promise<ChildProcess>
}
```

### 2. 提取表单模板

```typescript
// config/formTemplates.ts
import featureRequest from './form-templates/feature-request.json'
import bugReport from './form-templates/bug-report.json'

export const FORM_TEMPLATES: FormTemplate[] = [
  featureRequest,
  bugReport,
  // ...
]
```

### 3. 统一错误处理

```typescript
// services/errors.ts
export class ServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message)
  }
}

export class AgentNotFoundError extends ServiceError {
  constructor(agentId: string) {
    super('AGENT_NOT_FOUND', `智能体不存在: ${agentId}`)
  }
}
```

---

## 设计模式深化建议

### 问题分析

前端 CLI 策略实现中存在大量重复代码：

```typescript
// ClaudeCliStrategy.ts
export class ClaudeCliStrategy implements AgentStrategy {
  readonly name = 'Claude CLI'
  private abortController: AbortController | null = null
  private unlistenStream: UnlistenFn | null = null
  private currentSessionId: string | null = null

  supports(agent: AgentConfig): boolean {
    return agent.type === 'cli' && agent.provider === 'claude'
  }

  async execute(context, onEvent) {
    // 1. 监听流式事件
    this.unlistenStream = await listen(`claude-stream-${sessionId}`, ...)
    // 2. 构建请求 (几乎相同的代码)
    const request = { sessionId, agentType: 'cli', provider: 'claude', ... }
    // 3. 调用后端
    await invoke('execute_agent', { request })
    // 4. 清理资源
  }
}

// CodexCliStrategy.ts - 结构几乎完全相同
export class CodexCliStrategy implements AgentStrategy {
  readonly name = 'Codex CLI'
  // ... 相同的属性和方法结构
  // 唯一区别是 provider: 'codex' 和事件名前缀
}
```

### 模板方法模式 (Template Method) 重构

#### 1. 创建抽象基类

```typescript
// services/conversation/strategies/BaseCliStrategy.ts

import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AgentConfig } from '@/stores/agent'
import type {
  AgentStrategy,
  ConversationContext,
  StreamEvent,
  ExecutionRequest,
  CliStreamEvent
} from './types'

/// CLI 策略抽象配置
export interface CliStrategyConfig {
  /** 策略名称 */
  name: string
  /** 提供商标识 */
  provider: 'claude' | 'codex'
  /** 默认 CLI 路径 */
  defaultCliPath: string
  /** 事件名前缀 */
  eventPrefix: string
}

/// CLI 策略基类（模板方法模式）
export abstract class BaseCliStrategy implements AgentStrategy {
  protected abstract readonly config: CliStrategyConfig

  private abortController: AbortController | null = null
  private unlistenStream: UnlistenFn | null = null
  private currentSessionId: string | null = null

  get name(): string {
    return this.config.name
  }

  supports(agent: AgentConfig): boolean {
    return agent.type === 'cli' && agent.provider === this.config.provider
  }

  /// 模板方法：执行流程
  async execute(
    context: ConversationContext,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const { sessionId } = context

    this.currentSessionId = sessionId
    this.abortController = new AbortController()

    try {
      // 1. 监听流式事件
      await this.setupStreamListener(sessionId, onEvent)

      // 2. 构建请求（调用子类方法）
      const request = this.buildRequest(context)

      // 3. 记录开始日志
      this.logExecution('start', request, sessionId)

      // 4. 调用后端
      await invoke('execute_agent', { request })

      // 5. 记录完成日志
      this.logExecution('done', request, sessionId)

      // 6. 等待事件处理完成
      await this.waitForEvents()

    } catch (error) {
      this.handleError(error, onEvent)
    } finally {
      await this.cleanup()
    }
  }

  /// 设置流监听器
  private async setupStreamListener(
    sessionId: string,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const eventName = `${this.config.eventPrefix}-stream-${sessionId}`

    this.unlistenStream = await listen<CliStreamEvent>(
      eventName,
      (event) => {
        const streamEvent = this.transformEvent(event.payload)
        if (streamEvent) {
          onEvent(streamEvent)
        }
      }
    )
  }

  /// 构建请求（可被子类覆盖）
  protected buildRequest(context: ConversationContext): ExecutionRequest {
    const {
      sessionId,
      agent,
      messages,
      workingDirectory,
      mcpServers,
      cliOutputFormat,
      jsonSchema,
      extraCliArgs,
      executionMode,
      responseMode
    } = context

    return {
      sessionId,
      agentType: 'cli',
      provider: this.config.provider,
      cliPath: agent.cliPath || this.config.defaultCliPath,
      modelId: this.normalizeModelId(agent.modelId),
      messages: this.normalizeMessages(messages),
      workingDirectory,
      allowedTools: this.getAllowedTools(),
      mcpServers,
      cliOutputFormat: cliOutputFormat ?? (responseMode === 'json_once' ? 'json' : 'stream-json'),
      jsonSchema,
      extraCliArgs,
      executionMode: executionMode ?? 'chat',
      responseMode: responseMode ?? 'stream_text'
    }
  }

  /// 标准化模型 ID
  protected normalizeModelId(modelId?: string): string | undefined {
    if (!modelId?.trim() || modelId === 'default') {
      return undefined
    }
    return modelId
  }

  /// 标准化消息
  protected normalizeMessages(messages: any[]): any[] {
    return messages
      .filter(m => m.role !== 'compression')
      .map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content
      }))
  }

  /// 获取允许的工具列表（子类可覆盖）
  protected getAllowedTools(): string[] {
    return ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch']
  }

  /// 转换事件（抽象方法，子类实现）
  protected abstract transformEvent(payload: CliStreamEvent): StreamEvent | null

  /// 记录执行日志
  protected logExecution(phase: 'start' | 'done', request: ExecutionRequest, sessionId: string): void {
    console.info(`[AI Execute] ${phase}`, {
      provider: this.config.provider,
      mode: request.executionMode,
      responseMode: request.responseMode,
      outputFormat: request.cliOutputFormat,
      sessionId
    })
  }

  /// 等待事件处理
  protected async waitForEvents(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  /// 处理错误
  protected handleError(error: unknown, onEvent: (event: StreamEvent) => void): void {
    console.error(`[${this.config.name}] 执行失败:`, error)
    onEvent({
      type: 'error',
      content: error instanceof Error ? error.message : String(error)
    })
  }

  /// 清理资源
  protected async cleanup(): Promise<void> {
    if (this.unlistenStream) {
      this.unlistenStream()
      this.unlistenStream = null
    }
    this.abortController = null
    this.currentSessionId = null
  }

  /// 中止执行
  async abort(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort()
    }
    if (this.currentSessionId) {
      try {
        await invoke('abort_agent_execution', { sessionId: this.currentSessionId })
      } catch (error) {
        console.error(`[${this.config.name}] 中止失败:`, error)
      }
    }
  }
}
```

#### 2. Claude CLI 具体实现

```typescript
// services/conversation/strategies/ClaudeCliStrategy.ts

import { BaseCliStrategy, CliStrategyConfig } from './BaseCliStrategy'
import type { CliStreamEvent, StreamEvent } from './types'

export class ClaudeCliStrategy extends BaseCliStrategy {
  protected readonly config: CliStrategyConfig = {
    name: 'Claude CLI',
    provider: 'claude',
    defaultCliPath: 'claude',
    eventPrefix: 'claude'
  }

  /// Claude 特有的事件转换逻辑
  protected transformEvent(payload: CliStreamEvent): StreamEvent | null {
    // Claude 特定的 JSON 格式转换
    switch (payload.event_type) {
      case 'content_block_delta':
        return {
          type: 'content',
          content: payload.delta?.text || ''
        }
      case 'message_stop':
        return { type: 'done' }
      case 'error':
        return {
          type: 'error',
          content: payload.message || '未知错误'
        }
      default:
        return null
    }
  }
}
```

#### 3. Codex CLI 具体实现

```typescript
// services/conversation/strategies/CodexCliStrategy.ts

import { BaseCliStrategy, CliStrategyConfig } from './BaseCliStrategy'
import type { CliStreamEvent, StreamEvent } from './types'

export class CodexCliStrategy extends BaseCliStrategy {
  protected readonly config: CliStrategyConfig = {
    name: 'Codex CLI',
    provider: 'codex',
    defaultCliPath: 'codex',
    eventPrefix: 'codex'
  }

  /// Codex 可能需要不同的工具列表
  protected getAllowedTools(): string[] {
    return [
      'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
      'WebFetch', 'WebSearch', 'NotebookEdit'  // Codex 额外支持
    ]
  }

  /// Codex 特有的事件转换逻辑
  protected transformEvent(payload: CliStreamEvent): StreamEvent | null {
    // Codex 特定的 JSON 格式转换
    switch (payload.event_type) {
      case 'response.output':
        return {
          type: 'content',
          content: payload.content || ''
        }
      case 'response.done':
        return { type: 'done' }
      case 'error':
        return {
          type: 'error',
          content: payload.error || '未知错误'
        }
      default:
        return null
    }
  }
}
```

### 重构收益

| 方面 | 重构前 | 重构后 |
|------|--------|--------|
| 策略代码行数 | ~200 × 4 = 800 行 | ~50 × 4 + 150 = 350 行 |
| 新增 CLI 策略 | 复制粘贴 200 行 | 实现 config + transformEvent (~30行) |
| 公共逻辑修改 | 需同步修改 4 个文件 | 只修改基类 |
| 可测试性 | 难以单独测试 | 可独立测试基类逻辑 |

---

## 优化优先级

| 优先级 | 问题 | 工作量 | 影响 |
|--------|------|--------|------|
| P0 | 提取 CLI 策略基类 | 中 | 减少重复、可维护性 |
| P0 | 提取 FormEngine 硬编码模板 | 中 | 可维护性 |
| P1 | 拆分 ConversationService | 高 | 可维护性 |
| P2 | 统一错误处理 | 低 | 一致性 |
| P2 | 替换单例为 DI | 中 | 可测试性 |
| P3 | 提取魔法字符串 | 低 | 可维护性 |
