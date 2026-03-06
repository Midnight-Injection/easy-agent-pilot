import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 单个会话的执行状态
 */
export interface SessionExecutionState {
  /** 输入框内容 */
  inputText: string
  /** 是否正在发送消息 */
  isSending: boolean
  /** 是否正在流式输出 */
  isStreaming: boolean
  /** 流式输出定时器 ID */
  streamTimerId: ReturnType<typeof setInterval> | null
  /** 当前流式消息 ID */
  currentStreamingMessageId: string | null
  /** 启用的 MCP 插件 ID 列表 */
  enabledMcpIds: string[]
}

/**
 * 会话执行状态管理 Store
 *
 * 用于管理每个会话独立的执行状态，确保：
 * - 每个会话有独立的输入框内容
 * - 每个会话有独立的发送/流式输出状态
 * - 会话切换时状态保持独立
 * - 关闭会话时清理对应状态
 */
export const useSessionExecutionStore = defineStore('sessionExecution', () => {
  // State - 使用 Map 存储每个会话的执行状态
  const executionStates = ref<Map<string, SessionExecutionState>>(new Map())

  /**
   * 获取指定会话的执行状态，如果不存在则创建默认状态
   */
  const getExecutionState = (sessionId: string): SessionExecutionState => {
    let state = executionStates.value.get(sessionId)
    if (!state) {
      state = createDefaultState()
      executionStates.value.set(sessionId, state)
    }
    return state
  }

  /**
   * 获取当前输入框内容（计算属性）
   */
  const getInputText = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).inputText
    }
  })

  /**
   * 获取当前发送状态（计算属性）
   */
  const getIsSending = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).isSending
    }
  })

  /**
   * 获取当前流式输出状态（计算属性）
   */
  const getIsStreaming = computed(() => {
    return (sessionId: string) => {
      return getExecutionState(sessionId).isStreaming
    }
  })

  /**
   * 创建默认的执行状态
   */
  function createDefaultState(): SessionExecutionState {
    return {
      inputText: '',
      isSending: false,
      isStreaming: false,
      streamTimerId: null,
      currentStreamingMessageId: null,
      enabledMcpIds: []
    }
  }

  // State - MCP 选择状态（每个会话独立）
  const sessionMcpSelections = ref<Map<string, string[]>>(new Map())

  /**
   * 获取指定会话启用的 MCP 插件 ID 列表
   */
  function getEnabledMcpIds(sessionId: string): string[] {
    // 优先从独立 Map 获取，否则从执行状态获取
    const mcpIds = sessionMcpSelections.value.get(sessionId)
    if (mcpIds !== undefined) {
      return mcpIds
    }
    return getExecutionState(sessionId).enabledMcpIds
  }

  /**
   * 设置指定会话启用的 MCP 插件 ID 列表
   */
  function setEnabledMcpIds(sessionId: string, ids: string[]): void {
    sessionMcpSelections.value.set(sessionId, ids)
    // 同时更新执行状态
    const state = getExecutionState(sessionId)
    state.enabledMcpIds = ids
  }

  /**
   * 获取所有会话的 MCP 选择映射
   */
  const getEnabledMcpIdsMap = computed(() => sessionMcpSelections.value)

  /**
   * 切换 MCP 插件的启用状态
   */
  function toggleMcpId(sessionId: string, mcpId: string): void {
    const currentIds = getEnabledMcpIds(sessionId)
    const index = currentIds.indexOf(mcpId)
    if (index === -1) {
      setEnabledMcpIds(sessionId, [...currentIds, mcpId])
    } else {
      const newIds = [...currentIds]
      newIds.splice(index, 1)
      setEnabledMcpIds(sessionId, newIds)
    }
  }

  /**
   * 全选/取消全选 MCP 插件
   */
  function toggleAllMcpIds(sessionId: string, allMcpIds: string[], selectAll: boolean): void {
    if (selectAll) {
      setEnabledMcpIds(sessionId, [...allMcpIds])
    } else {
      setEnabledMcpIds(sessionId, [])
    }
  }

  /**
   * 更新输入框内容
   */
  function setInputText(sessionId: string, text: string) {
    const state = getExecutionState(sessionId)
    state.inputText = text
  }

  /**
   * 设置发送状态
   */
  function setIsSending(sessionId: string, sending: boolean) {
    const state = getExecutionState(sessionId)
    state.isSending = sending
  }

  /**
   * 设置流式输出状态
   */
  function setIsStreaming(sessionId: string, streaming: boolean) {
    const state = getExecutionState(sessionId)
    state.isStreaming = streaming
  }

  /**
   * 设置流式输出定时器 ID
   */
  function setStreamTimerId(sessionId: string, timerId: ReturnType<typeof setInterval> | null) {
    const state = getExecutionState(sessionId)
    state.streamTimerId = timerId
  }

  /**
   * 设置当前流式消息 ID
   */
  function setCurrentStreamingMessageId(sessionId: string, messageId: string | null) {
    const state = getExecutionState(sessionId)
    state.currentStreamingMessageId = messageId
  }

  /**
   * 开始发送消息 - 设置相关状态
   */
  function startSending(sessionId: string) {
    const state = getExecutionState(sessionId)
    state.isSending = true
    state.isStreaming = true
  }

  /**
   * 结束发送消息 - 清除相关状态
   */
  function endSending(sessionId: string) {
    const state = getExecutionState(sessionId)
    state.isSending = false
    state.isStreaming = false
    state.streamTimerId = null
    state.currentStreamingMessageId = null
  }

  /**
   * 停止流式输出
   */
  function stopStreaming(sessionId: string) {
    const state = getExecutionState(sessionId)

    // 清除定时器
    if (state.streamTimerId) {
      clearInterval(state.streamTimerId)
      state.streamTimerId = null
    }

    // 重置状态
    state.isSending = false
    state.isStreaming = false
    state.currentStreamingMessageId = null
  }

  /**
   * 清除指定会话的执行状态
   * 在关闭会话时调用
   */
  function clearExecutionState(sessionId: string) {
    const state = executionStates.value.get(sessionId)
    if (state) {
      // 清除可能存在的定时器
      if (state.streamTimerId) {
        clearInterval(state.streamTimerId)
      }
      // 删除状态
      executionStates.value.delete(sessionId)
    }
  }

  /**
   * 清除所有会话的执行状态
   */
  function clearAllExecutionStates() {
    // 清除所有定时器
    executionStates.value.forEach((state) => {
      if (state.streamTimerId) {
        clearInterval(state.streamTimerId)
      }
    })
    executionStates.value.clear()
  }

  /**
   * 检查是否有会话正在执行
   */
  const hasAnyRunningSession = computed(() => {
    for (const state of executionStates.value.values()) {
      if (state.isSending || state.isStreaming) {
        return true
      }
    }
    return false
  })

  /**
   * 获取所有正在执行的会话 ID
   */
  const runningSessionIds = computed(() => {
    const ids: string[] = []
    executionStates.value.forEach((state, sessionId) => {
      if (state.isSending || state.isStreaming) {
        ids.push(sessionId)
      }
    })
    return ids
  })

  return {
    // State
    executionStates,

    // Getters
    getInputText,
    getIsSending,
    getIsStreaming,
    hasAnyRunningSession,
    runningSessionIds,
    getEnabledMcpIds,
    getEnabledMcpIdsMap,

    // Actions
    getExecutionState,
    setInputText,
    setIsSending,
    setIsStreaming,
    setStreamTimerId,
    setCurrentStreamingMessageId,
    startSending,
    endSending,
    stopStreaming,
    clearExecutionState,
    clearAllExecutionStates,
    setEnabledMcpIds,
    toggleMcpId,
    toggleAllMcpIds
  }
})
