# 前端代码审查报告 - stores 模块

> 审查日期: 2026-03-09
> 审查范围: `src/stores/`

## 文件概览

| 文件 | 行数 | 说明 |
|------|------|------|
| taskSplit.ts | 1455 | 任务拆分状态管理 |
| taskExecution.ts | 1290 | 任务执行状态 |
| skillConfig.ts | 1152 | 技能配置管理 |
| settings.ts | 926 | 设置管理 |
| agentConfig.ts | 757 | 智能体配置 |
| task.ts | 723 | 任务 CRUD |
| marketplace.ts | 582 | 市场状态 |
| memory.ts | 547 | 记忆管理 |
| project.ts | 496 | 项目管理 |
| plan.ts | 386 | 计划管理 |
| message.ts | 370 | 消息管理 |
| agent.ts | 358 | 智能体管理 |
| sessionExecution.ts | 305 | 会话执行 |
| theme.ts | 310 | 主题管理 |
| token.ts | 238 | Token 管理 |
| notification.ts | 228 | 通知管理 |
| layout.ts | 265 | 布局状态 |
| windowState.ts | 261 | 窗口状态 |
| providerProfile.ts | 465 | 供应商配置 |
| session.ts | 440 | 会话管理 |
| 其他 | ~500 | appState, ui 等 |
| **总计** | **12007** | |

---

## 架构分析

### Pinia Store 模式

所有 store 使用 Composition API 风格：

```typescript
export const useXxxStore = defineStore('xxx', () => {
  // State
  const items = ref<Xxx[]>([])

  // Getters
  const currentItem = computed(() => ...)

  // Actions
  async function loadItems() { ... }

  return { items, currentItem, loadItems }
})
```

### Store 依赖关系

```
┌─────────────────────────────────────────────────────────────┐
│                      Core Stores                            │
│  notification ← agent ← agentConfig                         │
│  notification ← project ← session ← sessionExecution        │
│  notification ← plan ← task ← taskExecution ← taskSplit     │
└─────────────────────────────────────────────────────────────┘
```

---

## 问题分析

### 🔴 高优先级问题

#### 1. taskSplit.ts 文件过大

- **位置**: 整个文件
- **问题**: 1455 行单文件，包含多个职责
- **影响**: 可维护性差

**建议**: 拆分为多个模块

```
stores/taskSplit/
├── index.ts              # 主 store 导出
├── persistence.ts        # 持久化逻辑
├── parsing.ts            # AI 输出解析
├── strategies.ts         # 智能体策略
└── types.ts              # 类型定义
```

#### 2. 重复的数据转换逻辑

- **位置**: agent.ts L77-96, session.ts L44-59, project.ts L72-82
- **问题**: 每个文件都有类似的 `transformXxx` 函数

```typescript
// agent.ts
function transformAgent(raw: RawAgentData): AgentConfig { ... }

// session.ts
function transformSession(rustSession: RustSession): Session { ... }

// project.ts
function transformProject(p: ProjectFromDb): Project { ... }
```

**建议**: 创建通用的转换工具

```typescript
// utils/transform.ts
export function transformKeys<T>(obj: any, keyMap: Record<string, string>): T {
  // 通用的 snake_case → camelCase 转换
}
```

### 🟡 中优先级问题

#### 3. 错误处理模式重复

- **位置**: 多个 store 的 action 中
- **问题**: 每个 action 都有相同的 try-catch-notification 模式

```typescript
// 重复模式
async function loadXxx() {
  isLoading.value = true
  const notificationStore = useNotificationStore()
  try {
    const result = await invoke(...)
    // 处理结果
  } catch (error) {
    console.error('Failed to load xxx:', error)
    notificationStore.networkError('加载xxx', getErrorMessage(error), loadXxx)
  } finally {
    isLoading.value = false
  }
}
```

**建议**: 创建通用的错误处理装饰器或高阶函数

```typescript
// composables/useStoreAction.ts
export function withErrorHandling<T>(
  operation: string,
  action: () => Promise<T>,
  options?: { retry?: () => Promise<T> }
): Promise<T | null> {
  // 统一的错误处理逻辑
}
```

#### 4. localStorage 直接使用

- **位置**: session.ts L385-404, project.ts L108-111, taskSplit.ts L150-181
- **问题**: 直接使用 localStorage，没有统一的存储抽象

**建议**: 创建存储服务

```typescript
// services/storage.ts
export const storage = {
  get<T>(key: string, defaultValue?: T): T | null,
  set<T>(key: string, value: T): void,
  remove(key: string): void,
}
```

#### 5. 硬编码的常量

- **位置**: session.ts L62, notification.ts L21
- **问题**: 魔法数字

```typescript
export const MAX_OPEN_SESSIONS = 5
const defaultDuration = 5000
```

**建议**: 集中配置

```typescript
// config/constants.ts
export const APP_CONFIG = {
  maxOpenSessions: 5,
  notificationDuration: 5000,
}
```

### 🟢 低优先级问题

#### 6. 类型定义分散

- **问题**: 类型定义在各个 store 文件中，有些重复

**建议**: 统一到 `types/` 目录

#### 7. 缺少 Loading 状态统一管理

- **问题**: 每个 store 都有自己的 `isLoading`

**建议**: 可以考虑使用全局 loading 状态

---

## 设计亮点

### 1. notification.ts 的智能错误处理

```typescript
function smartError(operation: string, err: unknown, retryAction?: () => Promise<void>): string {
  const errorType = classifyError(err)

  switch (errorType) {
    case ErrorType.CLI_PATH_NOT_FOUND:
      return cliPathError(operation, err, retryAction)
    case ErrorType.API_AUTH_INVALID:
      return apiAuthError(err, retryAction)
    // ...
  }
}
```

### 2. session.ts 的多窗口会话锁定

```typescript
async function openSession(sessionId: string): Promise<boolean> {
  const windowManager = useWindowManagerStore()
  const lockedBy = await windowManager.isSessionLocked(sessionId)

  if (lockedBy && lockedBy !== windowManager.windowLabel) {
    return false // 会话在其他窗口中打开
  }

  await windowManager.lockSession(sessionId)
  return true
}
```

### 3. taskSplit.ts 的状态持久化

```typescript
function persistCurrentState() {
  // 关闭弹框前保存状态，便于恢复
  const stateToSave: PersistedSplitState = {
    messages: messages.value,
    llmMessages: llmMessages.value,
    splitResult: splitResult.value,
    context: context.value
  }
  saveAllPersistedStates({ ...getAllPersistedStates(), [planId]: stateToSave })
}
```

### 4. project.ts 的文件树懒加载

```typescript
async function loadProjectFiles(projectId: string, projectPath: string) {
  const result = await invoke<FileTreeNode[]>('list_project_files', { projectPath })
  projectFileTrees.value.set(projectId, result)
}

async function loadDirectoryChildren(dirPath: string): Promise<FileTreeNode[]> {
  return await invoke<FileTreeNode[]>('load_directory_children', { dirPath })
}
```

---

## 优化建议

### 1. 创建 Store 工具函数

```typescript
// stores/utils/storeUtils.ts
export function createLoadingState() {
  const isLoading = ref(false)
  return { isLoading }
}

export function createErrorState() {
  const error = ref<string | null>(null)
  return { error, clearError: () => error.value = null }
}

export async function withLoading<T>(
  isLoading: Ref<boolean>,
  action: () => Promise<T>
): Promise<T> {
  isLoading.value = true
  try {
    return await action()
  } finally {
    isLoading.value = false
  }
}
```

### 2. 统一数据转换

```typescript
// utils/transform.ts
export function snakeToCamel<T>(obj: any): T {
  if (!obj || typeof obj !== 'object') return obj

  return Object.entries(obj).reduce((acc, [key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    acc[camelKey] = value
    return acc
  }, {} as any)
}
```

### 3. 拆分 taskSplit.ts

```
stores/taskSplit/
├── index.ts              # 主 store (~300行)
├── persistence.ts        # 持久化 (~200行)
├── parsing.ts            # AI 输出解析 (~400行)
├── strategies.ts         # 智能体策略 (~300行)
└── types.ts              # 类型定义 (~100行)
```

---

## 设计模式深化建议

### 问题分析

stores 模块存在以下重复模式：

```typescript
// 问题 1: 数据转换重复
// agent.ts
function transformAgent(raw: RawAgentData): AgentConfig {
  return {
    id: raw.id,
    name: raw.name,
    agentType: raw.agent_type,  // snake_case → camelCase
    // ...
  }
}

// session.ts
function transformSession(rustSession: RustSession): Session {
  return {
    id: rustSession.id,
    sessionType: rustSession.session_type,  // 相同模式
    // ...
  }
}

// 问题 2: 错误处理重复
async function loadXxx() {
  isLoading.value = true
  try {
    const result = await invoke(...)
    // 处理
  } catch (error) {
    notificationStore.networkError('加载xxx', getErrorMessage(error), loadXxx)
  } finally {
    isLoading.value = false
  }
}

// 问题 3: localStorage 直接使用
localStorage.setItem('xxx', JSON.stringify(data))
const data = JSON.parse(localStorage.getItem('xxx') || 'null')
```

### 适配器模式 (Adapter Pattern) - 数据转换

#### 1. 定义通用转换器

```typescript
// utils/transform/adapter.ts

type KeyMapping = Record<string, string>
type TransformRule = {
  from?: string
  to: string
  transform?: (value: any) => any
}

/// 数据适配器配置
export interface AdapterConfig<T> {
  /// 字段映射（snake_case → camelCase）
  keyMap?: KeyMapping
  /// 自定义转换规则
  rules?: TransformRule[]
  /// 默认值
  defaults?: Partial<T>
}

/// 创建数据适配器
export function createAdapter<T>(config: AdapterConfig<T>) {
  return {
    /// 将后端数据适配为前端格式
    adapt(data: Record<string, any>): T {
      const result: Record<string, any> = { ...config.defaults }

      for (const [key, value] of Object.entries(data)) {
        // 1. 应用键映射
        let targetKey = config.keyMap?.[key] ?? camelCase(key)

        // 2. 应用自定义转换
        const rule = config.rules?.find(r => r.from === key)
        if (rule) {
          targetKey = rule.to
          result[targetKey] = rule.transform ? rule.transform(value) : value
        } else {
          result[targetKey] = value
        }
      }

      return result as T
    },

    /// 将前端数据适配为后端格式
    reverse(data: T): Record<string, any> {
      const result: Record<string, any> = {}

      for (const [key, value] of Object.entries(data as Record<string, any>)) {
        // 反向映射
        const sourceKey = Object.entries(config.keyMap || {})
          .find(([_, v]) => v === key)?.[0] ?? snakeCase(key)
        result[sourceKey] = value
      }

      return result
    }
  }
}

// 辅助函数
function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function snakeCase(str: string): string {
  return str.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
}
```

#### 2. 使用适配器

```typescript
// stores/agent.ts

import { createAdapter } from '@/utils/transform/adapter'

// 定义 Agent 适配器
const agentAdapter = createAdapter<AgentConfig>({
  keyMap: {
    'agent_type': 'agentType',
    'cli_path': 'cliPath',
    'api_key': 'apiKey',
    'base_url': 'baseUrl',
    'model_id': 'modelId',
    'custom_model_enabled': 'customModelEnabled',
    'created_at': 'createdAt',
    'updated_at': 'updatedAt',
  },
  defaults: {
    enabled: true,
  }
})

// 使用
async function loadAgents() {
  const rawAgents = await invoke<RawAgentData[]>('list_agents')
  agents.value = rawAgents.map(a => agentAdapter.adapt(a))
}

// 保存时反向适配
async function saveAgent(agent: AgentConfig) {
  const rawData = agentAdapter.reverse(agent)
  await invoke('update_agent', { input: rawData })
}
```

```typescript
// stores/session.ts

const sessionAdapter = createAdapter<Session>({
  keyMap: {
    'session_type': 'sessionType',
    'project_id': 'projectId',
    'agent_id': 'agentId',
    'model_id': 'modelId',
    'message_count': 'messageCount',
    'total_tokens': 'totalTokens',
    'created_at': 'createdAt',
    'updated_at': 'updatedAt',
  }
})
```

### 装饰器模式 (Decorator Pattern) - Action 增强

#### 1. 创建 Action 装饰器

```typescript
// stores/utils/actionDecorators.ts

import { useNotificationStore } from '../notification'

/// Action 上下文
interface ActionContext {
  name: string
  storeName: string
}

/// 装饰器选项
interface DecoratorOptions {
  /// 操作名称（用于错误消息）
  operation?: string
  /// 是否显示加载状态
  showLoading?: boolean
  /// 是否自动处理错误
  handleError?: boolean
  /// 重试函数
  retry?: () => Promise<any>
}

/// 创建带装饰器的 Action
export function withDecorators<T extends (...args: any[]) => Promise<any>>(
  action: T,
  context: ActionContext,
  options: DecoratorOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    const { operation = context.name, showLoading = true, handleError = true } = options

    // 这里可以添加各种装饰器逻辑
    // 由于 Vue 的响应式系统限制，需要在 store 内部调用

    return action(...args)
  }) as T
}

/// 加载状态装饰器
export function withLoading<T>(
  isLoading: Ref<boolean>,
  action: () => Promise<T>
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    isLoading.value = true
    try {
      resolve(await action())
    } catch (e) {
      reject(e)
    } finally {
      isLoading.value = false
    }
  })
}

/// 错误处理装饰器
export async function withErrorHandling<T>(
  operation: string,
  action: () => Promise<T>,
  retry?: () => Promise<T>
): Promise<T | null> {
  const notificationStore = useNotificationStore()

  try {
    return await action()
  } catch (error) {
    console.error(`${operation} failed:`, error)
    notificationStore.networkError(operation, getErrorMessage(error), retry)
    return null
  }
}

/// 组合装饰器
export async function withStoreAction<T>(
  isLoading: Ref<boolean>,
  operation: string,
  action: () => Promise<T>,
  options: { retry?: () => Promise<T>; silent?: boolean } = {}
): Promise<T | null> {
  isLoading.value = true

  try {
    return await action()
  } catch (error) {
    console.error(`${operation} failed:`, error)
    if (!options.silent) {
      const notificationStore = useNotificationStore()
      notificationStore.networkError(operation, getErrorMessage(error), options.retry)
    }
    return null
  } finally {
    isLoading.value = false
  }
}

/// 辅助函数
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '未知错误'
}
```

#### 2. 在 Store 中使用

```typescript
// stores/agent.ts (重构后)

import { withStoreAction } from './utils/actionDecorators'

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<AgentConfig[]>([])
  const isLoading = ref(false)

  // 重构前 (~25 行)
  // async function loadAgents() {
  //   isLoading.value = true
  //   try {
  //     const rawAgents = await invoke<RawAgentData[]>('list_agents')
  //     agents.value = rawAgents.map(transformAgent)
  //   } catch (error) {
  //     console.error('Failed to load agents:', error)
  //     notificationStore.networkError('加载智能体', getErrorMessage(error), loadAgents)
  //   } finally {
  //     isLoading.value = false
  //   }
  // }

  // 重构后 (~5 行)
  async function loadAgents() {
    const result = await withStoreAction(
      isLoading,
      '加载智能体',
      async () => {
        const rawAgents = await invoke<RawAgentData[]>('list_agents')
        agents.value = rawAgents.map(a => agentAdapter.adapt(a))
      },
      { retry: loadAgents }
    )
    return result !== null
  }

  async function createAgent(input: CreateAgentInput) {
    return withStoreAction(
      isLoading,
      '创建智能体',
      async () => {
        const result = await invoke<RawAgentData>('add_agent', { input })
        agents.value.push(agentAdapter.adapt(result))
        return result
      }
    )
  }

  return { agents, isLoading, loadAgents, createAgent }
})
```

### 代理模式 (Proxy Pattern) - 存储抽象

#### 1. 创建存储代理

```typescript
// services/storage/StorageProxy.ts

/// 存储接口
export interface IStorage {
  get<T>(key: string, defaultValue?: T): T | null
  set<T>(key: string, value: T): void
  remove(key: string): void
  clear(): void
  has(key: string): boolean
}

/// localStorage 代理
export class LocalStorageProxy implements IStorage {
  private prefix: string

  constructor(prefix: string = 'app_') {
    this.prefix = prefix
  }

  get<T>(key: string, defaultValue?: T): T | null {
    const fullKey = this.prefix + key
    const value = localStorage.getItem(fullKey)

    if (value === null) return defaultValue ?? null

    try {
      return JSON.parse(value) as T
    } catch {
      return value as unknown as T
    }
  }

  set<T>(key: string, value: T): void {
    const fullKey = this.prefix + key
    const serialized = typeof value === 'string' ? value : JSON.stringify(value)
    localStorage.setItem(fullKey, serialized)
  }

  remove(key: string): void {
    localStorage.removeItem(this.prefix + key)
  }

  clear(): void {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
  }

  has(key: string): boolean {
    return localStorage.getItem(this.prefix + key) !== null
  }
}

/// 内存存储（用于测试）
export class MemoryStorageProxy implements IStorage {
  private store: Map<string, any> = new Map()

  get<T>(key: string, defaultValue?: T): T | null {
    return this.store.has(key) ? this.store.get(key) : defaultValue ?? null
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, value)
  }

  remove(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  has(key: string): boolean {
    return this.store.has(key)
  }
}

/// 响应式存储代理
import { ref, watch, type Ref } from 'vue'

export function useStorage<T>(key: string, defaultValue: T, storage: IStorage = new LocalStorageProxy()): Ref<T> {
  const storedValue = storage.get<T>(key, defaultValue)
  const reactiveValue = ref<T>(storedValue as T) as Ref<T>

  watch(reactiveValue, (newValue) => {
    storage.set(key, newValue)
  }, { deep: true })

  return reactiveValue
}
```

#### 2. 使用存储代理

```typescript
// stores/session.ts (重构后)

import { LocalStorageProxy, useStorage } from '@/services/storage/StorageProxy'

const storage = new LocalStorageProxy('session_')

// 重构前
// const savedSessionIds = JSON.parse(localStorage.getItem('openSessionIds') || '[]')

// 重构后
const openSessionIds = useStorage<string[]>('openSessionIds', [], storage)

// 或使用非响应式
function persistSessionState() {
  storage.set('lastActiveSession', currentSessionId.value)
}
```

### 重构收益

| 方面 | 重构前 | 重构后 |
|------|--------|--------|
| 数据转换 | 每个 store 重复 ~30 行 | 适配器配置 ~10 行 |
| 错误处理 | 每个 action 重复 ~15 行 | withStoreAction ~3 行 |
| 存储访问 | 直接 localStorage | 统一代理，可测试 |
| 新增 store | 复制粘贴样板代码 | 使用工具函数 |

---

## 优化优先级

| 优先级 | 问题 | 工作量 | 影响 |
|--------|------|--------|------|
| P0 | 拆分 taskSplit.ts | 高 | 可维护性 |
| P1 | 创建数据适配器 | 中 | 减少重复 |
| P1 | 创建 Action 装饰器 | 中 | 减少重复 |
| P2 | 统一存储代理 | 低 | 可维护性、可测试性 |
| P2 | 集中配置常量 | 低 | 可维护性 |
| P3 | 类型定义整合 | 低 | 代码整洁 |
