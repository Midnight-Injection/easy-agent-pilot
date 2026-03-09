# 前端代码审查报告 - modules/types/utils/composables 模块

> 审查日期: 2026-03-09
> 审查范围: `src/modules/`, `src/types/`, `src/utils/`, `src/composables/`

## 文件概览

| 模块 | 行数 | 说明 |
|------|------|------|
| **modules/file-editor** | 1,106 | 文件编辑器模块 (Monaco) |
| **types** | 958 | TypeScript 类型定义 |
| **utils** | 789 | 工具函数 |
| **composables** | 654 | 组合式函数 |
| **总计** | **3,507** | |

---

## modules/file-editor 模块

### 目录结构

```
modules/file-editor/
├── index.ts                    # 模块导出
├── types/index.ts              # 类型定义
├── stores/fileEditor.ts        # 编辑器状态 (216行)
├── services/
│   ├── fileEditorService.ts    # 文件读写服务
│   └── lspService.ts           # LSP 服务
├── strategies/
│   ├── language-strategy.ts    # 语言策略接口
│   ├── registry.ts             # 策略注册表
│   └── builtin-strategies.ts   # 内置语言策略 (208行)
├── monaco/setup.ts             # Monaco 配置
└── components/
    ├── MonacoCodeEditor.vue    # Monaco 编辑器组件
    └── FileEditorWorkspace.vue # 编辑器工作区
```

### 设计亮点

#### 1. 语言策略模式

```typescript
// strategies/language-strategy.ts
export interface LanguageStrategy {
  readonly id: string
  readonly monacoLanguageId: MonacoLanguageId
  readonly supportsCompletion: boolean
  match(ctx: { extension: string; fileName: string }): boolean
  getCompletions?(): CompletionEntry[]
}

// strategies/registry.ts
export function getLanguageStrategy(filePath: string): LanguageStrategy {
  const ctx = { extension: getExtension(filePath), fileName: getFileName(filePath) }
  return builtinLanguageStrategies.find(s => s.match(ctx)) ?? fallbackStrategy
}
```

#### 2. 编辑器状态管理

```typescript
// stores/fileEditor.ts
export const useFileEditorStore = defineStore('fileEditor', () => {
  const isDirty = computed(() => content.value !== originalContent.value)

  const canSwitchFile = (): boolean => {
    if (!isDirty.value) return true
    return window.confirm(UNSAVED_CHANGES_CONFIRM)
  }

  const resolveLanguageState = async (filePath: string) => {
    const strategy = getLanguageStrategy(filePath)
    // 尝试 LSP 激活，失败则回退到内置策略
    try {
      const lspResult = await activateLspForFile(filePath)
      if (lspResult.activated) {
        return { languageId: lspResult.monacoLanguageId }
      }
    } catch { /* 静默回退 */ }
    return { languageId: strategy.monacoLanguageId }
  }
})
```

### 问题

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P2 | window.confirm | 使用原生 confirm，应替换为自定义对话框 |
| P3 | 硬编码关键词 | builtin-strategies.ts 中关键词列表可配置化 |

---

## types 模块

### 主要类型文件

| 文件 | 说明 |
|------|------|
| plan.ts | 计划和任务类型 |
| agent.ts | 智能体类型 (从 stores 导出) |
| session.ts | 会话类型 (从 stores 导出) |
| message.ts | 消息类型 (从 stores 导出) |

### 设计亮点

```typescript
// types/plan.ts - 完善的类型定义
export type PlanStatus = 'draft' | 'planning' | 'ready' | 'executing' | 'completed' | 'paused'
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'failed' | 'cancelled'

// 任务输入请求（等待用户输入时的表单请求）
export interface TaskInputRequest {
  formSchema: DynamicFormSchema
  question?: string
  requestedAt: string
}
```

### 问题

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P3 | 类型分散 | 部分类型定义在 stores 文件中，应统一到 types/ |

---

## utils 模块

### 主要工具文件

| 文件 | 行数 | 说明 |
|------|------|------|
| api.ts | 212 | Tauri invoke 封装和错误处理 |
| validation.ts | ~150 | 输入验证 |
| fileIcon.ts | ~100 | 文件图标映射 |
| logger.ts | ~50 | 日志工具 |

### 设计亮点

#### api.ts - 智能错误分类

```typescript
export enum ErrorType {
  CLI_PATH_INVALID = 'CLI_PATH_INVALID',
  CLI_PATH_NOT_FOUND = 'CLI_PATH_NOT_FOUND',
  API_AUTH_INVALID = 'API_AUTH_INVALID',
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  MCP_CONNECTION_FAILED = 'MCP_CONNECTION_FAILED',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNKNOWN = 'UNKNOWN'
}

export function classifyError(error: unknown): ErrorType {
  const message = getErrorMessage(error).toLowerCase()

  if (message.includes('cli') && message.includes('not found')) {
    return ErrorType.CLI_PATH_NOT_FOUND
  }
  // ... 更多分类规则
}

// 便捷判断函数
export function isTimeoutError(error: unknown): boolean
export function isAuthError(error: unknown): boolean
export function isCliError(error: unknown): boolean
export function isMcpError(error: unknown): boolean
```

### 问题

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P2 | classifyError 依赖字符串匹配 | 可能误判，建议后端返回错误码 |

---

## composables 模块

### 文件列表

| 文件 | 行数 | 说明 |
|------|------|------|
| useAsyncOperation.ts | 353 | 异步操作管理 |
| useConfirmDialog.ts | ~150 | 确认对话框 |

### 设计亮点

#### useAsyncOperation - 完整的异步操作管理

```typescript
export interface AsyncOperationState<T> {
  isLoading: boolean
  progress: number
  progressMessage: string
  error: string | null
  result: T | null
  isCancelled: boolean
  isCancellable: boolean
}

export function useAsyncOperation<T>(options: AsyncOperationOptions<T>) {
  // 支持 AbortController 取消
  let abortController: AbortController | null = null

  async function execute(asyncFn: (signal: AbortSignal, onProgress) => Promise<T>) {
    abortController = new AbortController()
    const result = await asyncFn(abortController.signal, handleProgress)
    return result
  }

  function cancel() {
    abortController?.abort()
    isCancelledRef.value = true
  }

  return { state, execute, cancel, reset, setProgress }
}
```

#### useGlobalLoading - 全局加载状态

```typescript
export function useGlobalLoading() {
  return {
    globalLoading: readonly(globalLoading),
    show, hide, updateProgress, updateMessage, cancel
  }
}
```

### 问题

| 优先级 | 问题 | 说明 |
|--------|------|------|
| P2 | 全局状态用 ref | globalLoading 使用模块级 ref，可考虑用 Pinia |

---

## 优化建议

### 1. 创建统一的文件编辑器对话框

```typescript
// composables/useUnsavedChangesDialog.ts
export function useUnsavedChangesDialog() {
  const dialog = useConfirmDialog()

  async function confirmDiscard(): Promise<boolean> {
    return await dialog.show({
      title: '未保存的修改',
      message: '当前文件有未保存修改，确认放弃这些修改吗？',
      confirmText: '放弃修改',
      cancelText: '继续编辑'
    })
  }

  return { confirmDiscard }
}
```

### 2. 错误码标准化

```typescript
// 与后端协商错误码
export enum BackendErrorCode {
  CLI_NOT_FOUND = 'E001',
  AUTH_INVALID = 'E002',
  // ...
}

export function classifyError(error: unknown): ErrorType {
  if (error instanceof InvokeError && error.code) {
    switch (error.code) {
      case BackendErrorCode.CLI_NOT_FOUND:
        return ErrorType.CLI_PATH_NOT_FOUND
      // ...
    }
  }
  // 回退到字符串匹配
}
```

### 3. 类型集中化

```
types/
├── index.ts          # 统一导出
├── plan.ts           # 计划相关
├── agent.ts          # 智能体相关 (从 stores 迁移)
├── session.ts        # 会话相关 (从 stores 迁移)
├── message.ts        # 消息相关 (从 stores 迁移)
└── api.ts            # API 相关类型
```

---

## 优化优先级

| 优先级 | 问题 | 工作量 | 影响 |
|--------|------|--------|------|
| P2 | 替换 window.confirm | 低 | 用户体验 |
| P2 | 全局状态迁移到 Pinia | 中 | 一致性 |
| P2 | 错误码标准化 | 中 | 可维护性 |
| P3 | 类型定义集中 | 低 | 可维护性 |
| P3 | 语言策略配置化 | 低 | 扩展性 |

---

## 待审查模块

| 序号 | 模块 | 文件数 | 预估复杂度 |
|------|------|--------|-----------|
| 1 | **components** | 70+ | ⭐⭐⭐⭐ 高 |
