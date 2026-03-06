import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import type { AgentConfig } from '@/stores/agent'

export interface SplitChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ExecuteTurnParams {
  agent: AgentConfig
  modelId: string
  workingDirectory?: string
  messages: SplitChatMessage[]
  systemPrompt?: string
  cliOutputFormat?: 'text' | 'json' | 'stream-json'
  jsonSchema?: string
  extraCliArgs?: string[]
  onContent: (delta: string) => void
}

interface ExecutionRequest {
  sessionId: string
  agentType: string
  provider: string
  cliPath?: string
  apiKey?: string
  baseUrl?: string
  modelId?: string
  messages: SplitChatMessage[]
  workingDirectory?: string
  allowedTools?: string[]
  systemPrompt?: string
  maxTokens?: number
  cliOutputFormat?: 'text' | 'json' | 'stream-json'
  jsonSchema?: string
  extraCliArgs?: string[]
}

interface StreamPayload {
  type: string
  session_id?: string
  content?: string
  error?: string
}

export class TaskSplitOrchestrator {
  private activeSessionId: string | null = null
  private activeAgentType: string | null = null
  private activeUnlisten: UnlistenFn | null = null

  async executeTurn(params: ExecuteTurnParams): Promise<string> {
    const {
      agent,
      modelId,
      workingDirectory,
      messages,
      systemPrompt,
      cliOutputFormat,
      jsonSchema,
      extraCliArgs,
      onContent
    } = params
    const provider = agent.provider || 'claude'
    const sessionId = crypto.randomUUID()

    // 先设置 activeSessionId，再调用 getEventName
    this.activeSessionId = sessionId
    this.activeAgentType = agent.type
    const eventName = this.getEventName(agent.type, provider)

    let fullContent = ''
    const streamErrors: string[] = []

    const request: ExecutionRequest = {
      sessionId,
      agentType: agent.type,
      provider,
      messages,
      modelId: modelId || undefined,
      workingDirectory,
      systemPrompt,
      maxTokens: agent.type === 'sdk' ? 4096 : undefined
    }

    if (agent.type === 'cli') {
      if (!agent.cliPath) {
        throw new Error('CLI 路径未配置')
      }
      request.cliPath = agent.cliPath
      request.allowedTools = this.getAllowedTools(provider)
      request.cliOutputFormat = cliOutputFormat
      request.jsonSchema = jsonSchema
      request.extraCliArgs = extraCliArgs
    } else {
      if (!agent.apiKey) {
        throw new Error('SDK API Key 未配置')
      }
      request.apiKey = agent.apiKey
      request.baseUrl = agent.baseUrl
    }

    console.log('[TaskSplitOrchestrator] 准备注册事件监听器:', eventName)
    this.activeUnlisten = await listen<StreamPayload>(eventName, (event) => {
      const payload = event.payload
      console.log('[TaskSplitOrchestrator] 收到事件:', eventName, 'payload:', JSON.stringify(payload))
      if (payload.type === 'content' && payload.content) {
        fullContent += payload.content
        onContent(payload.content)
      } else if (payload.type === 'error' && payload.error) {
        streamErrors.push(payload.error)
      }
    })
    console.log('[TaskSplitOrchestrator] 事件监听器注册完成, unlisten:', typeof this.activeUnlisten)
    console.log('[TaskSplitOrchestrator] 开始监听事件:', eventName)
    console.log('[TaskSplitOrchestrator] 请求参数:', JSON.stringify({
      sessionId,
      agentType: agent.type,
      provider,
      cliOutputFormat,
      jsonSchemaLength: jsonSchema?.length
    }))

    try {
      await invoke('execute_agent', { request })
      if (fullContent.trim().length > 0) {
        return fullContent
      }
      if (streamErrors.length > 0) {
        throw new Error(streamErrors[streamErrors.length - 1])
      }
      return fullContent
    } finally {
      this.cleanup()
    }
  }

  async abort(): Promise<void> {
    if (!this.activeSessionId || !this.activeAgentType) return
    const sessionId = this.activeSessionId
    const isCli = this.activeAgentType === 'cli'
    try {
      await invoke(isCli ? 'abort_cli_execution' : 'abort_sdk_execution', { sessionId })
    } catch (error) {
      console.warn('[TaskSplitOrchestrator] abort failed:', error)
    } finally {
      this.cleanup()
    }
  }

  private cleanup() {
    if (this.activeUnlisten) {
      this.activeUnlisten()
      this.activeUnlisten = null
    }
    this.activeSessionId = null
    this.activeAgentType = null
  }

  private getAllowedTools(provider: string): string[] {
    if (provider === 'codex') {
      return ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash']
    }
    return ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'WebFetch', 'WebSearch']
  }

  private getEventName(agentType: string, provider: string): string {
    const sessionId = this.activeSessionId || ''
    if (agentType === 'cli' && provider === 'claude') return `claude-stream-${sessionId}`
    if (agentType === 'cli' && provider === 'codex') return `codex-stream-${sessionId}`
    if (agentType === 'sdk' && provider === 'codex') return `codex-sdk-stream-${sessionId}`
    return `sdk-stream-${sessionId}`
  }
}

export const taskSplitOrchestrator = new TaskSplitOrchestrator()
