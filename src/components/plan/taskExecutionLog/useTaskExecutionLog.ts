import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import { useTaskStore } from '@/stores/task'
import { usePlanStore } from '@/stores/plan'
import { useAgentStore } from '@/stores/agent'
import { useAgentConfigStore } from '@/stores/agentConfig'
import type { TimelineEntry } from '@/types/timeline'
import type { TaskExecutionResultRecord } from '@/types/taskExecution'
import { buildToolCallMapFromLogs } from '@/utils/toolCallLog'
import { containsFormSchema, extractExecutionResult } from '@/utils/structuredContent'
import { buildStructuredResultContentFromRecord } from '@/utils/taskExecutionResult'
import { getTaskExecutionStatusMeta, resolveTaskExecutionStatus } from '@/utils/taskExecutionStatus'
import {
  DEFAULT_CONTEXT_WINDOW,
  resolveConfiguredContextWindow
} from '@/utils/configuredModelContext'
import type { ToolCall } from '@/stores/message'

interface UseTaskExecutionLogOptions {
  props: {
    taskId: string
  }
}

export function useTaskExecutionLog(options: UseTaskExecutionLogOptions) {
  interface TodoItem {
    id: string
    content: string
    status: 'pending' | 'in_progress' | 'completed'
    activeForm?: string
  }

  interface TodoSnapshot {
    items: TodoItem[]
    updatedAt: string
  }

  function normalizeTodoStatus(value: unknown): TodoItem['status'] {
    if (value === 'completed') return 'completed'
    if (value === 'in_progress') return 'in_progress'
    return 'pending'
  }

  function parseClaudeTodos(toolCall: ToolCall): TodoItem[] {
    const todos = Array.isArray(toolCall.arguments?.todos) ? toolCall.arguments.todos : []
    return todos.flatMap((todo: unknown, index: number) => {
      if (!todo || typeof todo !== 'object') return []
      const entry = todo as Record<string, unknown>
      const content = typeof entry.content === 'string' ? entry.content.trim() : ''
      if (!content) return []
      return [{
        id: `${toolCall.id}-${index}`,
        content,
        status: normalizeTodoStatus(entry.status),
        activeForm: typeof entry.activeForm === 'string' ? entry.activeForm.trim() : undefined
      }]
    })
  }

  function parseCodexPlan(toolCall: ToolCall): TodoItem[] {
    const plan = Array.isArray(toolCall.arguments?.plan) ? toolCall.arguments.plan : []
    return plan.flatMap((item: unknown, index: number) => {
      if (!item || typeof item !== 'object') return []
      const entry = item as Record<string, unknown>
      const content = typeof entry.step === 'string' ? entry.step.trim() : ''
      if (!content) return []
      return [{
        id: `${toolCall.id}-${index}`,
        content,
        status: normalizeTodoStatus(entry.status)
      }]
    })
  }

  function parseTodoSnapshotFromToolCalls(toolCalls: ToolCall[], timestamp: string): TodoSnapshot | null {
    for (let i = toolCalls.length - 1; i >= 0; i--) {
      const toolCall = toolCalls[i]
      const normalizedName = toolCall.name.trim().toLowerCase()
      if (normalizedName === 'todowrite') {
        const items = parseClaudeTodos(toolCall)
        if (items.length > 0) return { items, updatedAt: timestamp }
      }
      if (normalizedName === 'update_plan' || normalizedName === 'functions.update_plan') {
        const items = parseCodexPlan(toolCall)
        if (items.length > 0) return { items, updatedAt: timestamp }
      }
    }
    return null
  }

  function formatTodoStatusLabel(status: TodoItem['status']) {
    switch (status) {
      case 'in_progress': return '进行中'
      case 'completed': return '已完成'
      default: return '待办'
    }
  }

  const props = options.props

  const taskExecutionStore = useTaskExecutionStore()
  const taskStore = useTaskStore()
  const planStore = usePlanStore()
  const agentStore = useAgentStore()
  const agentConfigStore = useAgentConfigStore()
  // 日志容器引用
  const logContainerRef = ref<HTMLElement | null>(null)

  const autoScroll = ref(true)
  const resultRecord = ref<TaskExecutionResultRecord | null>(null)

  const task = computed(() => {
    return taskStore.tasks.find(t => t.id === props.taskId)
  })

  const executionState = computed(() => {
    return taskExecutionStore.getExecutionState(props.taskId)
  })

  const tokenUsageWindow = computed(() => executionState.value?.tokenUsage ?? {
    inputTokens: 0,
    outputTokens: 0,
    resetCount: 0,
    lastUpdatedAt: null
  })

  const tokenContextLimit = computed(() => {
    const currentTask = task.value
    if (!currentTask) return DEFAULT_CONTEXT_WINDOW

    const plan = planStore.plans.find(item => item.id === currentTask.planId)
    const agentId = currentTask.agentId || plan?.splitAgentId
    const modelId = currentTask.modelId || plan?.splitModelId
    const runtimeModel = tokenUsageWindow.value.model?.trim()

    if (!agentId) {
      return DEFAULT_CONTEXT_WINDOW
    }

    const agent = agentStore.agents.find(item => item.id === agentId)
    return resolveConfiguredContextWindow(agentConfigStore.getModelsConfigs(agentId), {
      runtimeModelId: runtimeModel,
      selectedModelId: modelId,
      agentModelId: agent?.modelId
    })
  })

  const tokenUsageTotal = computed(() =>
    tokenUsageWindow.value.inputTokens + tokenUsageWindow.value.outputTokens
  )

  const tokenUsagePercentage = computed(() => {
    if (tokenContextLimit.value <= 0) return 0
    return Math.min(100, (tokenUsageTotal.value / tokenContextLimit.value) * 100)
  })

  const tokenUsageLevel = computed(() => {
    if (tokenUsagePercentage.value >= 95) return 'critical'
    if (tokenUsagePercentage.value >= 80) return 'danger'
    if (tokenUsagePercentage.value >= 60) return 'warning'
    return 'safe'
  })

  const tokenProgressStyle = computed(() => ({
    width: `${tokenUsagePercentage.value}%`
  }))

  const logs = computed(() => {
    return executionState.value?.logs ?? []
  })

  const isTodoCollapsed = ref(true)

  const todoSnapshot = computed<TodoSnapshot | null>(() => {
    const allToolCalls = executionState.value?.toolCalls ?? []
    const lastTimestamp = logs.value.length > 0
      ? logs.value[logs.value.length - 1].timestamp
      : ''
    return parseTodoSnapshotFromToolCalls(allToolCalls, lastTimestamp)
  })

  const sortedTodoItems = computed(() => {
    const items = todoSnapshot.value?.items ?? []
    const weight = (status: TodoItem['status']) => {
      switch (status) {
        case 'in_progress': return 0
        case 'pending': return 1
        default: return 2
      }
    }
    return [...items].sort((left, right) => weight(left.status) - weight(right.status))
  })

  const todoCompletedCount = computed(() =>
    sortedTodoItems.value.filter(item => item.status === 'completed').length
  )

  const activeTodoItems = computed(() =>
    sortedTodoItems.value.filter(item => item.status === 'in_progress').slice(0, 2)
  )

  const hiddenActiveTodoCount = computed(() =>
    Math.max(0, sortedTodoItems.value.filter(item => item.status === 'in_progress').length - activeTodoItems.value.length)
  )

  const logActivity = computed(() => {
    const latestLog = logs.value[logs.value.length - 1]
    return [
      logs.value.length,
      latestLog?.id ?? '',
      latestLog?.type ?? '',
      latestLog?.content.length ?? 0,
      latestLog?.timestamp ?? ''
    ].join(':')
  })

  // 是否等待用户输入
  const isWaitingInput = computed(() => {
    return task.value?.status === 'blocked' && task.value?.blockReason === 'waiting_input'
  })

  const effectiveStatus = computed(() => {
    const memoryStatus = executionState.value?.status
    if (memoryStatus && memoryStatus !== 'idle') {
      return memoryStatus
    }
    return resolveTaskExecutionStatus(task.value, memoryStatus)
  })

  const isRunning = computed(() => {
    return effectiveStatus.value === 'running'
  })

  const structuredResultContent = computed(() => {
    if (resultRecord.value) {
      return buildStructuredResultContentFromRecord(resultRecord.value)
    }

    // 当 resultRecord 尚未加载时，尝试从累积内容中提取 result_summary
    if (isRunning.value || !executionState.value?.accumulatedContent) return ''
    const extracted = extractExecutionResult(executionState.value.accumulatedContent)
    if (!extracted) return ''

    const hasFiles = extracted.generatedFiles.length > 0
      || extracted.modifiedFiles.length > 0
      || extracted.changedFiles.length > 0
      || extracted.deletedFiles.length > 0
    if (!extracted.summary && !hasFiles) return ''

    return JSON.stringify({
      result_summary: extracted.summary,
      generated_files: extracted.generatedFiles,
      modified_files: extracted.modifiedFiles,
      changed_files: extracted.changedFiles,
      deleted_files: extracted.deletedFiles
    }, null, 2)
  })

  const statusText = computed(() => {
    return getTaskExecutionStatusMeta(effectiveStatus.value).label
  })

  // 状态颜色
  const statusColor = computed(() => {
    return getTaskExecutionStatusMeta(effectiveStatus.value).color
  })

  async function handleStop() {
    const currentTask = task.value
    const shouldPauseQueue = Boolean(
      currentTask
      && taskExecutionStore.getCurrentRunningTaskId(currentTask.planId) === props.taskId
    )

    await taskExecutionStore.stopTaskExecution(
      props.taskId,
      shouldPauseQueue ? { pauseQueue: true, autoAdvance: false } : undefined
    )
  }

  async function handleResume() {
    await taskExecutionStore.resumeTaskExecution(props.taskId)
  }

  // 清除日志
  async function handleClearLogs() {
    await taskExecutionStore.clearTaskLogs(props.taskId)
  }

  // 提交表单输入
  async function handleInputSubmit(values: Record<string, unknown>) {
    await taskExecutionStore.submitTaskInput(props.taskId, values)
  }

  async function handleSkip() {
    await taskExecutionStore.skipBlockedTask(props.taskId)
  }

  async function loadResultRecord(taskId: string) {
    const currentTask = taskStore.tasks.find(item => item.id === taskId)
    if (!currentTask) {
      resultRecord.value = null
      return
    }

    const records = await taskExecutionStore.listRecentPlanResults(currentTask.planId, 200)
    resultRecord.value = records.find(record => record.task_id === taskId) ?? null
  }

  function scrollToBottom() {
    if (logContainerRef.value && autoScroll.value) {
      nextTick(() => {
        logContainerRef.value!.scrollTop = logContainerRef.value!.scrollHeight
      })
    }
  }

  watch(logActivity, () => {
    scrollToBottom()
  })

  function handleScroll() {
    if (!logContainerRef.value) return
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.value
    autoScroll.value = scrollHeight - scrollTop - clientHeight < 50
  }

  const timelineEntries = computed<TimelineEntry[]>(() => {
    const toolCallMap = buildToolCallMapFromLogs(logs.value, {
      fallbackStatus: isRunning.value ? 'running' : 'success'
    })
    let lastThinkingEntry: TimelineEntry | null = null
    let lastContentEntry: TimelineEntry | null = null

    return logs.value.reduce<TimelineEntry[]>((entries, log) => {
      if (log.type === 'tool_result' || log.type === 'tool_input_delta') {
        return entries
      }

      const activeFormId = task.value?.inputRequest?.formSchema.formId
      if (
        log.type === 'content'
        && isWaitingInput.value
        && containsFormSchema(log.content, activeFormId)
      ) {
        lastThinkingEntry = null
        lastContentEntry = null
        return entries
      }

      if (log.type === 'thinking_start') {
        if (!lastThinkingEntry) {
          lastThinkingEntry = {
            id: `entry-${log.id}`,
            type: 'thinking',
            content: '',
            timestamp: log.timestamp,
            animate: isRunning.value
          }
          entries.push(lastThinkingEntry)
        }
        return entries
      }

      if (log.type === 'thinking') {
        if (lastThinkingEntry) {
          lastThinkingEntry.content = `${lastThinkingEntry.content || ''}${log.content}`
          lastThinkingEntry.timestamp = log.timestamp
          lastThinkingEntry.animate = isRunning.value
        } else {
          lastThinkingEntry = {
            id: `entry-${log.id}`,
            type: 'thinking',
            content: log.content,
            timestamp: log.timestamp,
            animate: isRunning.value
          }
          entries.push(lastThinkingEntry)
        }
        lastContentEntry = null
        return entries
      }

      if (log.type === 'content') {
        if (lastContentEntry) {
          lastContentEntry.content = `${lastContentEntry.content || ''}${log.content}`
          lastContentEntry.timestamp = log.timestamp
          lastContentEntry.animate = isRunning.value
        } else {
          lastContentEntry = {
            id: `entry-${log.id}`,
            type: 'content',
            content: log.content,
            timestamp: log.timestamp,
            animate: isRunning.value
          }
          entries.push(lastContentEntry)
        }
        lastThinkingEntry = null
        return entries
      }

      lastThinkingEntry = null
      lastContentEntry = null

      if (log.type === 'tool_use') {
        const toolCall = toolCallMap.get(log.id)
        if (toolCall) {
          entries.push({
            id: `tool-${log.id}`,
            type: 'tool',
            toolCall,
            timestamp: log.timestamp,
            animate: isRunning.value
          })
        }
        return entries
      }

      entries.push({
        id: `entry-${log.id}`,
        type: log.type === 'error' ? 'error' : 'system',
        content: log.content,
        timestamp: log.timestamp,
        animate: isRunning.value,
        runtimeFallbackUsage: log.metadata?.model || log.metadata?.inputTokens !== undefined || log.metadata?.outputTokens !== undefined
          ? {
              model: typeof log.metadata?.model === 'string' ? log.metadata.model : undefined,
              inputTokens: typeof log.metadata?.inputTokens === 'number' ? log.metadata.inputTokens : undefined,
              outputTokens: typeof log.metadata?.outputTokens === 'number' ? log.metadata.outputTokens : undefined
            }
          : undefined
      })
      return entries
    }, [])
  })

  // 加载历史日志
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  onMounted(async () => {
    await taskExecutionStore.loadTaskLogs(props.taskId)
    await loadResultRecord(props.taskId)
    scrollToBottom()

    // 兜底：如果首次加载后日志仍为空，延迟重试一次从后端加载
    if (logs.value.length === 0) {
      retryTimer = setTimeout(async () => {
        await taskExecutionStore.loadTaskLogs(props.taskId)
        await loadResultRecord(props.taskId)
        scrollToBottom()
      }, 1500)
    }
  })

  onUnmounted(() => {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  })

  watch(
    () => props.taskId,
    async (taskId) => {
      if (retryTimer) {
        clearTimeout(retryTimer)
        retryTimer = null
      }
      await taskExecutionStore.loadTaskLogs(taskId)
      await loadResultRecord(taskId)
      scrollToBottom()
    }
  )

  watch(
    () => `${task.value?.status || ''}:${task.value?.updatedAt || ''}`,
    async () => {
      await taskExecutionStore.loadTaskLogs(props.taskId)
      await loadResultRecord(props.taskId)
      scrollToBottom()
    }
  )

  return {
    normalizeTodoStatus,
    parseClaudeTodos,
    parseCodexPlan,
    parseTodoSnapshotFromToolCalls,
    formatTodoStatusLabel,
    taskExecutionStore,
    taskStore,
    planStore,
    agentStore,
    agentConfigStore,
    logContainerRef,
    autoScroll,
    resultRecord,
    task,
    executionState,
    tokenUsageWindow,
    tokenContextLimit,
    tokenUsageTotal,
    tokenUsagePercentage,
    tokenUsageLevel,
    tokenProgressStyle,
    logs,
    isTodoCollapsed,
    todoSnapshot,
    sortedTodoItems,
    todoCompletedCount,
    activeTodoItems,
    hiddenActiveTodoCount,
    logActivity,
    isWaitingInput,
    effectiveStatus,
    isRunning,
    structuredResultContent,
    statusText,
    statusColor,
    handleStop,
    handleResume,
    handleClearLogs,
    handleInputSubmit,
    handleSkip,
    loadResultRecord,
    scrollToBottom,
    handleScroll,
    timelineEntries,
  }
}
