# AI 响应停止按钮实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 AI 消息流式输出过程中添加停止按钮，允许用户中断当前请求

**Architecture:** 利用现有后端 abort 机制，在前端 AgentExecutor 中增加会话-策略映射管理，ConversationService 新增 abort 方法，MessageItem 组件添加停止按钮

**Tech Stack:** Vue 3, TypeScript, Pinia, Tauri

---

### Task 1: 扩展 Message 状态类型

**Files:**
- Modify: `src/stores/message.ts`
- Modify: `src/locales/zh-CN.ts`
- Modify: `src/locales/en-US.ts`

**Step 1: 修改 MessageStatus 类型**

在 `src/stores/message.ts` 中，找到 `MessageStatus` 类型定义，添加 `interrupted` 状态：

```typescript
export type MessageStatus = 'streaming' | 'completed' | 'error' | 'interrupted'
```

**Step 2: 添加国际化文案**

在 `src/locales/zh-CN.ts` 中添加：

```typescript
interrupted: '已中断'
```

在 `src/locales/en-US.ts` 中添加：

```typescript
interrupted: 'Interrupted'
```

**Step 3: 提交**

```bash
git add src/stores/message.ts src/locales/zh-CN.ts src/locales/en-US.ts
git commit -m "feat(message): 新增 interrupted 消息状态类型"
```

---

### Task 2: AgentExecutor 支持多会话管理

**Files:**
- Modify: `src/services/conversation/AgentExecutor.ts`

**Step 1: 修改 AgentExecutor 类**

将 `currentStrategy` 改为 `activeStrategies` Map，并新增按会话 ID 中断的方法：

```typescript
export class AgentExecutor {
  private strategies: AgentStrategy[] = []
  // 改为 Map 支持多会话并行
  private activeStrategies: Map<string, AgentStrategy> = new Map()

  constructor() {
    // 注册默认策略（保持不变）
    this.registerStrategy(new ClaudeCliStrategy())
    this.registerStrategy(new CodexCliStrategy())
    this.registerStrategy(new ClaudeSdkStrategy())
    this.registerStrategy(new CodexSdkStrategy())
  }

  // registerStrategy, getSupportedStrategy, isSupported 保持不变

  async execute(
    context: ConversationContext,
    onEvent: (event: StreamEvent) => void
  ): Promise<void> {
    const { agent, sessionId } = context

    const strategy = this.getSupportedStrategy(agent)
    if (!strategy) {
      onEvent({
        type: 'error',
        error: `不支持的智能体类型: ${agent.type} (${agent.provider || 'unknown'})`
      })
      return
    }

    // 注册到 activeStrategies
    this.activeStrategies.set(sessionId, strategy)

    try {
      await strategy.execute(context, onEvent)
    } finally {
      // 执行完成后从 Map 中移除
      this.activeStrategies.delete(sessionId)
    }
  }

  /**
   * 中断指定会话的执行
   */
  abort(sessionId: string): void {
    const strategy = this.activeStrategies.get(sessionId)
    if (strategy) {
      strategy.abort()
      this.activeStrategies.delete(sessionId)
    }
  }

  // getRegisteredStrategies 保持不变
}
```

**Step 2: 提交**

```bash
git add src/services/conversation/AgentExecutor.ts
git commit -m "feat(executor): 支持多会话并行的策略管理"
```

---

### Task 3: ConversationService 新增 abort 方法

**Files:**
- Modify: `src/services/conversation/ConversationService.ts`

**Step 1: 添加 abort 方法**

在 `ConversationService` 类中添加 `abort` 方法：

```typescript
/**
 * 中断指定会话的执行
 * @param sessionId 会话 ID
 * @param messageId 可选的消息 ID，用于更新消息状态
 */
abort(sessionId: string, messageId?: string): void {
  const messageStore = useMessageStore()
  const sessionExecutionStore = useSessionExecutionStore()

  // 1. 调用 AgentExecutor 中断策略
  agentExecutor.abort(sessionId)

  // 2. 更新消息状态为 interrupted
  if (messageId) {
    messageStore.updateMessage(messageId, { status: 'interrupted' })
  } else {
    // 如果没有传入 messageId，从 sessionExecutionStore 获取当前流式消息 ID
    const streamingMessageId = sessionExecutionStore.getExecutionState(sessionId).currentStreamingMessageId
    if (streamingMessageId) {
      messageStore.updateMessage(streamingMessageId, { status: 'interrupted' })
    }
  }

  // 3. 更新会话执行状态
  sessionExecutionStore.endSending(sessionId)
}
```

**Step 2: 修改现有 abort 方法**

将原有的无参数 `abort()` 方法改为调用新方法：

```typescript
/**
 * 中断当前执行（向后兼容）
 * @deprecated 使用 abort(sessionId) 替代
 */
abort(): void {
  // 向后兼容：中断所有正在执行的会话
  const sessionExecutionStore = useSessionExecutionStore()
  const runningIds = sessionExecutionStore.runningSessionIds
  for (const sessionId of runningIds) {
    this.abort(sessionId)
  }
}
```

**Step 3: 提交**

```bash
git add src/services/conversation/ConversationService.ts
git commit -m "feat(conversation): 新增按会话 ID 中断执行的 abort 方法"
```

---

### Task 4: MessageItem 组件添加停止按钮

**Files:**
- Modify: `src/components/message/MessageItem.vue`

**Step 1: 导入 conversationService**

在 script setup 部分添加导入：

```typescript
import { conversationService } from '@/services/conversation'
```

**Step 2: 添加停止处理函数**

```typescript
const handleStop = () => {
  if (props.message.status === 'streaming') {
    conversationService.abort(props.sessionId, props.message.id)
  }
}
```

**Step 3: 在模板中添加停止按钮**

在消息内容区域底部，当 `status === 'streaming'` 时显示停止按钮。找到消息内容显示的位置，在其下方添加：

```vue
<!-- 停止按钮 - 仅在流式输出时显示 -->
<div
  v-if="message.status === 'streaming'"
  class="message-stop-button"
>
  <button
    class="stop-btn"
    @click="handleStop"
    :title="t('common.stop')"
  >
    <EaIcon name="stop" size="14" />
  </button>
</div>
```

**Step 4: 添加样式**

```scss
.message-stop-button {
  margin-top: 8px;
  display: flex;
  justify-content: flex-start;

  .stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: var(--color-bg-secondary);
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: var(--color-bg-tertiary);
    }

    :deep(.ea-icon) {
      color: var(--color-text-secondary);
    }
  }
}
```

**Step 5: 提交**

```bash
git add src/components/message/MessageItem.vue
git commit -m "feat(message): 添加流式输出停止按钮"
```

---

### Task 5: 添加 interrupted 状态显示

**Files:**
- Modify: `src/components/message/MessageItem.vue`

**Step 1: 添加 interrupted 状态标签**

在消息状态显示区域（通常在消息底部），添加 interrupted 状态的显示：

```vue
<!-- 已中断状态标签 -->
<span
  v-if="message.status === 'interrupted'"
  class="message-status interrupted"
>
  {{ t('message.status.interrupted') }}
</span>
```

**Step 2: 添加样式**

```scss
.message-status.interrupted {
  color: var(--color-warning, #f59e0b);
  font-size: 12px;
}
```

**Step 3: 提交**

```bash
git add src/components/message/MessageItem.vue
git commit -m "feat(message): 添加已中断状态显示"
```

---

### Task 6: 添加国际化键值

**Files:**
- Modify: `src/locales/zh-CN.ts`
- Modify: `src/locales/en-US.ts`

**Step 1: 添加停止按钮文案**

zh-CN.ts:
```typescript
common: {
  // ...existing
  stop: '停止'
}

message: {
  status: {
    // ...existing
    interrupted: '已中断'
  }
}
```

en-US.ts:
```typescript
common: {
  // ...existing
  stop: 'Stop'
}

message: {
  status: {
    // ...existing
    interrupted: 'Interrupted'
  }
}
```

**Step 2: 提交**

```bash
git add src/locales/zh-CN.ts src/locales/en-US.ts
git commit -m "feat(i18n): 添加停止按钮和中断状态国际化文案"
```

---

### Task 7: 确认 stop 图标存在

**Files:**
- Check: `src/components/common/EaIcon.vue` 或图标资源目录

**Step 1: 检查图标**

确认项目中是否有 `stop` 图标。如果没有，可以使用其他现有图标（如 `close` 或 `square`），或者添加新图标。

**Step 2: 如果需要添加图标**

将 SVG 图标文件添加到图标目录，并在 EaIcon 组件中注册。

**Step 3: 提交（如有修改）**

```bash
git add src/components/common/EaIcon.vue
git commit -m "feat(icon): 添加 stop 图标"
```

---

## 测试清单

1. **单会话停止测试**
   - 发送消息，在流式输出过程中点击停止按钮
   - 验证消息状态变为 `interrupted`
   - 验证已生成的内容被保留

2. **多会话并行测试**
   - 在两个会话中同时发送消息
   - 在其中一个会话中点击停止
   - 验证只有该会话被停止，另一个继续执行

3. **UI 测试**
   - 验证停止按钮仅在 `streaming` 状态时显示
   - 验证 hover 效果正常
   - 验证 `interrupted` 状态标签显示正确

---

## 文件改动总览

| 文件 | 改动类型 |
|------|----------|
| `src/stores/message.ts` | 修改 |
| `src/services/conversation/AgentExecutor.ts` | 修改 |
| `src/services/conversation/ConversationService.ts` | 修改 |
| `src/components/message/MessageItem.vue` | 修改 |
| `src/locales/zh-CN.ts` | 修改 |
| `src/locales/en-US.ts` | 修改 |
