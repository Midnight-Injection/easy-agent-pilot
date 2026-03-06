import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAgentStore, type AgentConfig } from './agent'
import { logger } from '@/utils/logger'
import { formEngine } from '@/services/plan'
import {
  taskSplitOrchestrator,
  type SplitChatMessage,
  buildPlanSplitSystemPrompt,
  buildPlanSplitKickoffPrompt,
  buildFormResponsePrompt,
  buildPlanSplitJsonSchema
} from '@/services/plan'
import type {
  SplitMessage,
  AIOutput,
  AITaskItem,
  TaskPriority,
  DynamicFormSchema
} from '@/types/plan'

interface TaskSplitContext {
  planId: string
  planName: string
  planDescription?: string
  granularity: number
  agentId: string
  modelId: string
  workingDirectory?: string
}

interface ParsedAiResult {
  output?: AIOutput
  error?: string
  debug?: ParseDebugInfo
}

interface ParseAttemptDebug {
  candidateIndex: number
  candidatePreview: string
  parseError?: string
  normalizeError?: string
}

interface ParseDebugInfo {
  rawContent: string
  sanitizedContent: string
  candidateCount: number
  attempts: ParseAttemptDebug[]
}

interface TaskSplitTurnExecutionParams {
  agent: AgentConfig
  context: TaskSplitContext
  messages: SplitChatMessage[]
  onContent: (delta: string) => void
}

interface TaskSplitAgentStrategy {
  readonly name: string
  supports(agent: AgentConfig): boolean
  executeTurn(params: TaskSplitTurnExecutionParams): Promise<string>
  parseOutput(content: string, minTaskCount: number): ParsedAiResult | null
}

export const useTaskSplitStore = defineStore('taskSplit', () => {
  const messages = ref<SplitMessage[]>([])
  const isProcessing = ref(false)
  const splitResult = ref<AITaskItem[] | null>(null)
  const currentFormId = ref<string | null>(null)
  const context = ref<TaskSplitContext | null>(null)

  const llmMessages = ref<SplitChatMessage[]>([])

  async function initSession(nextContext: TaskSplitContext) {
    reset()
    context.value = nextContext

    llmMessages.value = [
      {
        role: 'system',
        content: buildPlanSplitSystemPrompt()
      }
    ]

    const kickoffPrompt = buildPlanSplitKickoffPrompt({
      planName: nextContext.planName,
      planDescription: nextContext.planDescription,
      minTaskCount: nextContext.granularity
    })

    const kickoffDisplayContent = [
      `计划标题：${nextContext.planName}`,
      `计划描述：${nextContext.planDescription?.trim() || '（无）'}`,
      `拆分任务数量：至少拆分 ${nextContext.granularity} 个任务`
    ].join('\n')

    await submitUserMessage(kickoffPrompt, {
      visible: true,
      displayContent: kickoffDisplayContent
    })
  }

  async function submitUserMessage(
    content: string,
    options?: { visible?: boolean; displayContent?: string }
  ) {
    if (!content.trim() || isProcessing.value || !context.value) return

    const visible = options?.visible ?? true
    const displayContent = options?.displayContent ?? content.trim()

    if (visible) {
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: displayContent,
        timestamp: new Date().toISOString()
      })
    }

    llmMessages.value.push({
      role: 'user',
      content: content.trim()
    })

    await runAssistantTurn()
  }

  async function submitFormResponse(formId: string, values: Record<string, unknown>) {
    if (!context.value || isProcessing.value) return

    const lastFormMessage = [...messages.value]
      .reverse()
      .find(message => message.formSchema?.formId === formId)

    if (lastFormMessage) {
      lastFormMessage.formValues = values
    }

    const prompt = buildFormResponsePrompt(formId, values)
    await submitUserMessage(prompt, {
      visible: true,
      displayContent: '我已提交表单信息，请继续拆分。'
    })
  }

  async function runAssistantTurn() {
    if (!context.value) return

    const agentStore = useAgentStore()
    const agent = agentStore.agents.find(a => a.id === context.value?.agentId)
    if (!agent) {
      messages.value.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '未找到选中的智能体，请重新选择后重试。',
        timestamp: new Date().toISOString()
      })
      return
    }

    isProcessing.value = true
    try {
      await runAssistantTurnInternal(agent)
    } finally {
      isProcessing.value = false
    }
  }

  async function runAssistantTurnInternal(
    agent: AgentConfig
  ) {
    if (!context.value) return
    const strategy = resolveTaskSplitStrategy(agent)

    logger.info('[runAssistantTurnInternal] 使用策略:', strategy.name)

    const assistantMessage: SplitMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    }
    messages.value.push(assistantMessage)

    try {
      logger.info('[runAssistantTurnInternal] 开始执行策略...')
      const finalContent = await strategy.executeTurn({
        agent,
        context: context.value,
        messages: llmMessages.value,
        onContent: (delta) => { assistantMessage.content += delta }
      })

      logger.info('[runAssistantTurnInternal] 策略执行完成, finalContent length:', finalContent?.length || 0)
      logger.info('[runAssistantTurnInternal] finalContent preview:', previewText(finalContent || '', 500))

      assistantMessage.rawContent = finalContent
      llmMessages.value.push({ role: 'assistant', content: finalContent })

      const parsed = parseAIOutput(finalContent, context.value.granularity, strategy)
      if (!parsed.output) {
        logParseDebug(parsed, finalContent)
        assistantMessage.content = `解析失败：${parsed.error || '模型输出格式无法解析，请补充需求后重试。'}`
        return
      }

      applyParsedOutput(assistantMessage, parsed.output)
    } catch (error) {
      logger.error('[runAssistantTurnInternal] 执行出错:', error)
      assistantMessage.content = `拆分失败：${error instanceof Error ? error.message : String(error)}`
    }
  }

  function applyParsedOutput(message: SplitMessage, output: AIOutput) {
    if (output.type === 'form_request') {
      message.content = output.question || '请先补充以下信息。'
      message.formSchema = output.formSchema
      currentFormId.value = output.formSchema.formId
      return
    }

    if (output.type === 'task_split') {
      splitResult.value = output.tasks
      currentFormId.value = null
      message.content = `DONE：任务拆分完成，共生成 ${output.tasks.length} 个任务，请确认。`
    }
  }

  async function executeTurnWithJsonStructuredOutput(params: TaskSplitTurnExecutionParams): Promise<string> {
    const { agent, context: splitContext, messages: splitMessages, onContent } = params
    logger.info('[executeTurnWithJsonStructuredOutput] 开始执行, agent:', agent.name, 'modelId:', splitContext.modelId)
    const result = await taskSplitOrchestrator.executeTurn({
      agent,
      modelId: splitContext.modelId,
      workingDirectory: splitContext.workingDirectory,
      messages: splitMessages,
      systemPrompt: splitMessages.find(msg => msg.role === 'system')?.content,
      cliOutputFormat: 'json',
      jsonSchema: buildPlanSplitJsonSchema(splitContext.granularity),
      onContent
    })
    logger.info('[executeTurnWithJsonStructuredOutput] 执行完成, result length:', result?.length || 0)
    return result
  }

  async function executeTurnWithDefaultStrategy(params: TaskSplitTurnExecutionParams): Promise<string> {
    const { agent, context: splitContext, messages: splitMessages, onContent } = params
    return taskSplitOrchestrator.executeTurn({
      agent,
      modelId: splitContext.modelId,
      workingDirectory: splitContext.workingDirectory,
      messages: splitMessages,
      systemPrompt: splitMessages.find(msg => msg.role === 'system')?.content,
      onContent
    })
  }

  const claudeCliTaskSplitStrategy: TaskSplitAgentStrategy = {
    name: 'claude-cli-task-split',
    supports: (agent) => agent.type === 'cli' && (agent.provider || '').toLowerCase() === 'claude',
    executeTurn: executeTurnWithJsonStructuredOutput,
    parseOutput: parseClaudeCliOutput
  }

  const codexCliTaskSplitStrategy: TaskSplitAgentStrategy = {
    name: 'codex-cli-task-split',
    supports: (agent) => agent.type === 'cli' && (agent.provider || '').toLowerCase() === 'codex',
    executeTurn: executeTurnWithJsonStructuredOutput,
    parseOutput: parseCodexCliOutput
  }

  const defaultTaskSplitStrategy: TaskSplitAgentStrategy = {
    name: 'default-task-split',
    supports: () => true,
    executeTurn: executeTurnWithDefaultStrategy,
    parseOutput: () => null
  }

  const taskSplitStrategies: TaskSplitAgentStrategy[] = [
    claudeCliTaskSplitStrategy,
    codexCliTaskSplitStrategy
  ]

  function resolveTaskSplitStrategy(agent: AgentConfig): TaskSplitAgentStrategy {
    return taskSplitStrategies.find(strategy => strategy.supports(agent)) ?? defaultTaskSplitStrategy
  }

  function parseAIOutput(content: string, minTaskCount: number, strategy: TaskSplitAgentStrategy): ParsedAiResult {
    const strategyParsed = strategy.parseOutput(content, minTaskCount)
    // 如果策略返回了结果（无论成功还是失败），直接返回
    if (strategyParsed) {
      return strategyParsed
    }

    const jsonCandidates = extractJsonCandidates(content)
    const sanitized = sanitizeAssistantOutput(content)
    const attempts: ParseAttemptDebug[] = []

    // 优先使用最后一个候选（通常是模型最终输出）
    for (let i = jsonCandidates.length - 1; i >= 0; i -= 1) {
      const jsonText = jsonCandidates[i]
      const attempt: ParseAttemptDebug = {
        candidateIndex: i,
        candidatePreview: previewText(jsonText, 600)
      }

      try {
        const parsed = JSON.parse(jsonText)
        const normalized = normalizeAIOutput(parsed, minTaskCount)
        if (normalized.output) {
          return normalized
        }
        attempt.normalizeError = normalized.error || 'unknown normalize error'
      } catch {
        attempt.parseError = 'JSON.parse failed'
      }
      attempts.push(attempt)
    }

    return {
      error: '无法解析为有效的 JSON 输出。',
      debug: {
        rawContent: content,
        sanitizedContent: sanitized,
        candidateCount: jsonCandidates.length,
        attempts
      }
    }
  }

  function extractJsonCandidates(content: string): string[] {
    const candidates: string[] = []
    const sanitized = sanitizeAssistantOutput(content)
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi

    let match: RegExpExecArray | null
    while ((match = codeBlockRegex.exec(sanitized)) !== null) {
      if (match[1]?.trim()) {
        candidates.push(match[1].trim())
      }
    }

    // 从纯文本中提取所有平衡 JSON 对象（过滤掉前置思考/工具噪声）
    candidates.push(...extractBalancedJsonObjects(sanitized))

    if (sanitized.trim()) {
      candidates.push(sanitized.trim())
    }

    // 去重，保持顺序
    const seen = new Set<string>()
    return candidates.filter(item => {
      if (seen.has(item)) return false
      seen.add(item)
      return true
    })
  }

  function sanitizeAssistantOutput(content: string): string {
    return content
      .replace(/<thinking[\s\S]*?<\/thinking>/gi, '')
      .replace(/<tool_use[\s\S]*?<\/tool_use>/gi, '')
      .replace(/<tool_result[\s\S]*?<\/tool_result>/gi, '')
      .replace(/<assistant_thinking[\s\S]*?<\/assistant_thinking>/gi, '')
      .trim()
  }

  function extractBalancedJsonObjects(text: string): string[] {
    const objects: string[] = []
    let start = -1
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index]

      if (inString) {
        if (escaped) {
          escaped = false
          continue
        }
        if (char === '\\') {
          escaped = true
          continue
        }
        if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        inString = true
        continue
      }

      if (char === '{') {
        if (depth === 0) {
          start = index
        }
        depth += 1
        continue
      }

      if (char === '}') {
        if (depth === 0) continue
        depth -= 1
        if (depth === 0 && start >= 0) {
          objects.push(text.slice(start, index + 1))
          start = -1
        }
      }
    }

    return objects
  }

  function normalizeAIOutput(value: unknown, minTaskCount: number): ParsedAiResult {
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i -= 1) {
        const normalized = normalizeAIOutput(value[i], minTaskCount)
        if (normalized.output) {
          return normalized
        }
      }
      return { error: '输出是数组，但未找到有效的 form_request 或 task_split(DONE)。' }
    }

    if (!value || typeof value !== 'object') {
      return { error: '输出不是 JSON 对象。' }
    }

    const record = value as Record<string, unknown>

    if (typeof record.result === 'string') {
      const nested = tryParseNestedJson(record.result, minTaskCount)
      if (nested?.output) {
        return nested
      }
    }

    const rawType = asNonEmptyString(record.type)
    const normalizedType = rawType ? rawType.trim().toLowerCase() : null

    if (normalizedType === 'form_request') {
      return normalizeFormRequest(record)
    }

    if (normalizedType === 'task_split' || normalizedType === 'done') {
      return normalizeTaskSplit(record, minTaskCount)
    }

    if (isDoneSignal(record) && Array.isArray(record.tasks)) {
      return normalizeTaskSplit(record, minTaskCount)
    }

    return { error: '输出 type 必须为 form_request 或 task_split（status 必须为 DONE）。' }
  }

  function normalizeFormRequest(record: Record<string, unknown>): ParsedAiResult {
    const question = typeof record.question === 'string' ? record.question : ''
    const schema = normalizeFormSchema(record.formSchema ?? record.form_schema ?? record.schema)
    if (!schema) {
      return { error: 'form_request 缺少 formSchema。' }
    }

    const validSchema = formEngine.validateSchema(schema)
    if (!validSchema) {
      return { error: 'formSchema 结构无效。' }
    }

    return {
      output: {
        type: 'form_request',
        question: question || '请补充以下信息：',
        formSchema: validSchema
      }
    }
  }

  function normalizeTaskSplit(record: Record<string, unknown>, minTaskCount: number): ParsedAiResult {
    if (!isDoneSignal(record)) {
      return { error: 'task_split 必须包含 status: "DONE"（或等价 DONE 标记）。' }
    }

    const tasksRaw = record.tasks ?? record.task_list ?? record.taskList
    if (!Array.isArray(tasksRaw)) {
      return { error: 'task_split 缺少 tasks 数组。' }
    }
    if (tasksRaw.length < minTaskCount) {
      return { error: `拆分任务数量不足，至少需要 ${minTaskCount} 个。` }
    }

    const tasks: AITaskItem[] = []
    for (const item of tasksRaw) {
      if (!item || typeof item !== 'object') {
        return { error: 'tasks 中存在无效任务对象。' }
      }

      const task = item as Record<string, unknown>
      const title = asNonEmptyString(task.title)
      const description = asNonEmptyString(task.description)
      const priority = asPriority(task.priority)
      const implementationSteps = asStringArray(task.implementationSteps ?? task.implementation_steps ?? task.steps)
      const testSteps = asStringArray(task.testSteps ?? task.test_steps ?? task.testingSteps ?? task.testing_steps)
      const acceptanceCriteria = asStringArray(task.acceptanceCriteria ?? task.acceptance_criteria)

      if (!title || !description || !priority) {
        return { error: '任务缺少必要字段（title/description/priority）。' }
      }
      if (implementationSteps.length === 0 || testSteps.length === 0 || acceptanceCriteria.length === 0) {
        return { error: '任务步骤字段不能为空（implementationSteps/testSteps/acceptanceCriteria）。' }
      }

      tasks.push({
        title,
        description,
        priority,
        implementationSteps,
        testSteps,
        acceptanceCriteria
      })
    }

    return { output: { type: 'task_split', tasks } }
  }

  function isDoneSignal(record: Record<string, unknown>): boolean {
    if (record.done === true) return true

    const statusRaw = asNonEmptyString(record.status ?? record.state ?? record.phase)
    return statusRaw?.toUpperCase() === 'DONE'
  }

  function normalizeFormSchema(value: unknown): DynamicFormSchema | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const fieldsRaw = raw.fields
    if (!Array.isArray(fieldsRaw)) {
      return null
    }

    const normalizedFields = fieldsRaw
      .map(field => normalizeFormField(field))
      .filter((field): field is NonNullable<typeof field> => Boolean(field))

    const formId = asNonEmptyString(raw.formId ?? raw.form_id ?? raw.id)
    const title = asNonEmptyString(raw.title ?? raw.name)
    if (!formId || !title || normalizedFields.length === 0) {
      return null
    }

    return {
      formId,
      title,
      description: asOptionalString(raw.description),
      fields: normalizedFields,
      submitText: asOptionalString(raw.submitText ?? raw.submit_text)
    }
  }

  function normalizeFormField(value: unknown): DynamicFormSchema['fields'][number] | null {
    if (!value || typeof value !== 'object') {
      return null
    }

    const raw = value as Record<string, unknown>
    const name = asNonEmptyString(raw.name ?? raw.field ?? raw.field_name)
    const label = asNonEmptyString(raw.label ?? raw.title ?? raw.name)
    const type = asNonEmptyString(raw.type)

    if (!name || !label || !type) {
      return null
    }

    const field: DynamicFormSchema['fields'][number] = { name, label, type: type as DynamicFormSchema['fields'][number]['type'] }

    if (typeof raw.required === 'boolean') field.required = raw.required
    if (raw.default !== undefined) field.default = raw.default
    if (asOptionalString(raw.placeholder)) field.placeholder = asOptionalString(raw.placeholder)

    if (Array.isArray(raw.options)) {
      field.options = raw.options
        .map(option => {
          if (!option || typeof option !== 'object') return null
          const opt = option as Record<string, unknown>
          const optLabel = asNonEmptyString(opt.label)
          if (!optLabel || opt.value === undefined) return null
          return { label: optLabel, value: opt.value }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    }

    if (raw.validation && typeof raw.validation === 'object') {
      field.validation = raw.validation as DynamicFormSchema['fields'][number]['validation']
    }

    if (raw.condition && typeof raw.condition === 'object') {
      field.condition = raw.condition as DynamicFormSchema['fields'][number]['condition']
    }

    return field
  }

  function tryParseNestedJson(content: string, minTaskCount: number): ParsedAiResult | null {
    const nestedCandidates = extractJsonCandidates(content)
    for (let i = nestedCandidates.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(nestedCandidates[i])
        const normalized = normalizeAIOutput(parsed, minTaskCount)
        if (normalized.output) {
          return normalized
        }
      } catch {
        // ignore parse error
      }
    }
    return null
  }

  function parseClaudeCliOutput(content: string, minTaskCount: number): ParsedAiResult | null {
    logger.info('[parseClaudeCliOutput] 开始解析, content length:', content.length)
    logger.info('[parseClaudeCliOutput] content preview:', previewText(content, 500))

    const jsonCandidates = extractJsonCandidates(content)
    logger.info('[parseClaudeCliOutput] 提取到 JSON 候选项数量:', jsonCandidates.length)

    for (let i = jsonCandidates.length - 1; i >= 0; i -= 1) {
      const candidatePreview = previewText(jsonCandidates[i], 200)
      logger.info(`[parseClaudeCliOutput] 处理候选项 ${i}:`, candidatePreview)

      try {
        const parsed = JSON.parse(jsonCandidates[i])
        if (!parsed || typeof parsed !== 'object') {
          logger.info(`[parseClaudeCliOutput] 候选项 ${i} 不是对象，跳过`)
          continue
        }

        const record = parsed as Record<string, unknown>
        logger.info('[parseClaudeCliOutput] 解析成功，检查 structured_output:', !!record.structured_output)

        // 优先处理 structured_output 字段
        if (record.structured_output && typeof record.structured_output === 'object') {
          logger.info('[parseClaudeCliOutput] 找到 structured_output，开始标准化')
          const normalized = normalizeAIOutput(record.structured_output, minTaskCount)
          logger.info('[parseClaudeCliOutput] 标准化结果:', normalized.output ? '成功' : `失败: ${normalized.error}`)
          // 无论成功还是失败，都返回结果（包含错误信息）
          return normalized
        }

        // 如果没有 structured_output，尝试直接解析
        logger.info('[parseClaudeCliOutput] 没有 structured_output，尝试直接解析')
        const normalized = normalizeAIOutput(record, minTaskCount)
        if (normalized.output) {
          logger.info('[parseClaudeCliOutput] 直接解析成功')
          return normalized
        }
        logger.info('[parseClaudeCliOutput] 直接解析失败:', normalized.error)
      } catch (e) {
        logger.error(`[parseClaudeCliOutput] 候选项 ${i} JSON 解析失败:`, e)
      }
    }

    logger.error('[parseClaudeCliOutput] 所有候选项都解析失败，返回 null')
    return null
  }

  function parseCodexCliOutput(content: string, minTaskCount: number): ParsedAiResult | null {
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)

    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i]
      if (!line.startsWith('{') && !line.startsWith('[')) continue

      try {
        const parsed = JSON.parse(line)
        if (!parsed || typeof parsed !== 'object') continue
        const record = parsed as Record<string, unknown>

        const directOutput = record.output_struct
          ?? record.structured_output
          ?? record.output
          ?? record.result
        if (directOutput !== undefined) {
          if (typeof directOutput === 'string') {
            const nested = tryParseNestedJson(directOutput, minTaskCount)
            if (nested?.output) {
              return nested
            }
          }
          const normalized = normalizeAIOutput(directOutput, minTaskCount)
          if (normalized.output) {
            return normalized
          }
        }

        const item = record.item
        if (item && typeof item === 'object') {
          const normalized = normalizeAIOutput(item, minTaskCount)
          if (normalized.output) {
            return normalized
          }
        }
      } catch {
        // ignore parse error
      }
    }

    return null
  }

  function asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  function asOptionalString(value: unknown): string | undefined {
    const normalized = asNonEmptyString(value)
    return normalized ?? undefined
  }

  function asPriority(value: unknown): TaskPriority | null {
    if (value === 'high' || value === 'medium' || value === 'low') {
      return value
    }

    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'p0' || normalized === 'urgent' || normalized === 'critical' || normalized === 'high' || normalized === '高') {
        return 'high'
      }
      if (normalized === 'p1' || normalized === 'normal' || normalized === 'medium' || normalized === '中') {
        return 'medium'
      }
      if (normalized === 'p2' || normalized === 'low' || normalized === '低') {
        return 'low'
      }
    }
    return null
  }

  function asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
  }

  function previewText(text: string, maxLength = 500): string {
    const normalized = text.replace(/\s+/g, ' ').trim()
    if (normalized.length <= maxLength) return normalized
    return `${normalized.slice(0, maxLength)}...`
  }

  function logParseDebug(parsed: ParsedAiResult, rawContent: string) {
    const debug = parsed.debug
    // 始终打印原始内容，方便调试
    logger.error('[TaskSplitParser] rawContent length:', rawContent.length)
    logger.error('[TaskSplitParser] rawContent preview:', previewText(rawContent, 2000))

    if (!debug) {
      logger.error('[TaskSplitParser] parse failed without debug info', {
        error: parsed.error,
        rawPreview: previewText(rawContent, 1200)
      })
      return
    }

    logger.error('[TaskSplitParser] output parse failed', {
      error: parsed.error,
      candidateCount: debug.candidateCount,
      attempts: debug.attempts
    })
    logger.info('[TaskSplitParser] raw content', debug.rawContent)
    logger.info('[TaskSplitParser] sanitized content', debug.sanitizedContent)
  }

  function updateSplitTask(index: number, updates: Partial<AITaskItem>) {
    if (splitResult.value && splitResult.value[index]) {
      splitResult.value[index] = { ...splitResult.value[index], ...updates }
    }
  }

  function removeSplitTask(index: number) {
    if (splitResult.value) {
      splitResult.value.splice(index, 1)
    }
  }

  function addSplitTask(task: AITaskItem) {
    if (!splitResult.value) {
      splitResult.value = []
    }
    splitResult.value.push(task)
  }

  async function abort() {
    await taskSplitOrchestrator.abort()
  }

  function reset() {
    messages.value = []
    isProcessing.value = false
    splitResult.value = null
    currentFormId.value = null
    context.value = null
    llmMessages.value = []
  }

  return {
    messages,
    isProcessing,
    splitResult,
    currentFormId,
    context,
    initSession,
    submitUserMessage,
    submitFormResponse,
    updateSplitTask,
    removeSplitTask,
    addSplitTask,
    abort,
    reset
  }
})
