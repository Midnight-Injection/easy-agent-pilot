#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

function parseArgs(argv) {
  const args = {
    cliPath: 'claude',
    outputFormat: 'json',
    minTasks: 3,
    allowedTools: 'Read,Write,Edit,Glob,Grep,Bash,WebFetch,WebSearch',
    timeoutMs: 180000
  }

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    const value = argv[i + 1]
    if (!key.startsWith('--')) continue

    switch (key) {
      case '--cli-path':
        args.cliPath = value
        i += 1
        break
      case '--model':
        args.model = value
        i += 1
        break
      case '--output-format':
        args.outputFormat = value
        i += 1
        break
      case '--schema-file':
        args.schemaFile = value
        i += 1
        break
      case '--messages-file':
        args.messagesFile = value
        i += 1
        break
      case '--prompt':
        args.prompt = value
        i += 1
        break
      case '--working-dir':
        args.workingDir = value
        i += 1
        break
      case '--allowed-tools':
        args.allowedTools = value
        i += 1
        break
      case '--extra-arg':
        if (!args.extraArgs) args.extraArgs = []
        args.extraArgs.push(value)
        i += 1
        break
      case '--min-tasks':
        args.minTasks = Number.parseInt(value, 10) || 3
        i += 1
        break
      case '--timeout-ms':
        args.timeoutMs = Number.parseInt(value, 10) || 180000
        i += 1
        break
      default:
        break
    }
  }

  return args
}

function defaultSchema(minTasks) {
  const n = Number.isFinite(minTasks) ? Math.max(1, Math.floor(minTasks)) : 3
  return JSON.stringify({
    type: 'object',
    required: ['type'],
    properties: {
      type: { type: 'string', enum: ['form_request', 'task_split'] },
      question: { type: 'string' },
      formSchema: { type: 'object' },
      status: { type: 'string', enum: ['DONE'] },
      tasks: { type: 'array', items: { type: 'object' } }
    },
    additionalProperties: false,
    allOf: [
      {
        if: {
          type: 'object',
          properties: { type: { const: 'form_request' } },
          required: ['type']
        },
        then: {
          required: ['type', 'formSchema'],
          properties: {
            type: { const: 'form_request' },
            question: { type: 'string' },
            formSchema: {
              type: 'object',
              required: ['formId', 'title', 'fields'],
              properties: {
                formId: { type: 'string', minLength: 1 },
                title: { type: 'string', minLength: 1 },
                description: { type: 'string' },
                submitText: { type: 'string' },
                fields: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 1,
                  items: {
                    type: 'object',
                    required: ['name', 'label', 'type'],
                    properties: {
                      name: { type: 'string', minLength: 1 },
                      label: { type: 'string', minLength: 1 },
                      type: {
                        type: 'string',
                        enum: ['text', 'textarea', 'select', 'multiselect', 'number', 'checkbox', 'radio', 'date', 'slider']
                      },
                      required: { type: 'boolean' },
                      placeholder: { type: 'string' },
                      options: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['label', 'value'],
                          properties: {
                            label: { type: 'string' },
                            value: {}
                          },
                          additionalProperties: true
                        }
                      },
                      validation: { type: 'object', additionalProperties: true }
                    },
                    additionalProperties: true
                  }
                }
              },
              additionalProperties: true
            }
          }
        }
      },
      {
        if: {
          type: 'object',
          properties: { type: { const: 'task_split' } },
          required: ['type']
        },
        then: {
          required: ['type', 'status', 'tasks'],
          properties: {
            type: { const: 'task_split' },
            status: { const: 'DONE' },
            tasks: {
              type: 'array',
              minItems: n,
              items: {
                type: 'object',
                required: ['title', 'description', 'priority', 'implementationSteps', 'testSteps', 'acceptanceCriteria'],
                properties: {
                  title: { type: 'string', minLength: 1 },
                  description: { type: 'string', minLength: 1 },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                  implementationSteps: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string', minLength: 1 }
                  },
                  testSteps: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string', minLength: 1 }
                  },
                  acceptanceCriteria: {
                    type: 'array',
                    minItems: 1,
                    items: { type: 'string', minLength: 1 }
                  }
                },
                additionalProperties: false
              }
            }
          }
        }
      }
    ]
  })
}

function defaultMessages() {
  return [
    {
      role: 'system',
      content: '你是资深项目规划助手。你不能输出自由文本解释，必须严格输出 JSON。每次只输出一个 form_request 或最终 task_split。'
    },
    {
      role: 'user',
      content: '请为“新功能开发”拆分任务。若信息不足先输出一个 form_request（只含一个字段），否则输出 task_split 且 status=DONE。'
    }
  ]
}

function shellEscape(value) {
  if (!value) return "''"
  return `'${String(value).replace(/'/g, `'"'"'`)}'`
}

function buildInputText(messages) {
  return messages
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n')
}

function parseJsonWithFallback(text) {
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    return JSON.parse(trimmed)
  } catch {
    // ignore
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i])
    } catch {
      // ignore
    }
  }

  return null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const messages = args.messagesFile
    ? JSON.parse(readFileSync(args.messagesFile, 'utf8'))
    : args.prompt
      ? [{ role: 'user', content: args.prompt }]
      : defaultMessages()

  const schema = args.schemaFile
    ? readFileSync(args.schemaFile, 'utf8').trim()
    : defaultSchema(args.minTasks)

  const inputText = buildInputText(messages)

  const commandArgs = ['-p', inputText, '--output-format', args.outputFormat]

  if (args.model && args.model.trim()) {
    commandArgs.push('--model', args.model.trim())
  }

  if (args.allowedTools && args.allowedTools.trim()) {
    commandArgs.push('--allowedTools', args.allowedTools.trim())
  }

  if (schema) {
    commandArgs.push('--json-schema', schema)
  }

  if (Array.isArray(args.extraArgs)) {
    commandArgs.push(...args.extraArgs)
  }

  if (args.workingDir && args.workingDir.trim()) {
    commandArgs.push('--add-dir', args.workingDir.trim())
  }

  const printableCommand = [args.cliPath, ...commandArgs].map(shellEscape).join(' ')
  console.log('== Program-Equivalent Command ==')
  console.log(printableCommand)

  const startedAt = Date.now()
  const child = spawn(args.cliPath, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
  let timedOut = false

  let stdout = ''
  let stderr = ''

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString()
  })

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString()
  })

  const timeout = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
  }, Math.max(1000, args.timeoutMs))

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })
  clearTimeout(timeout)

  const durationMs = Date.now() - startedAt

  console.log('\n== Exit ==')
  console.log(JSON.stringify({ exitCode, durationMs, timedOut }, null, 2))

  console.log('\n== Raw STDOUT ==')
  console.log(stdout.trim() || '<empty>')

  console.log('\n== Raw STDERR ==')
  console.log(stderr.trim() || '<empty>')

  const parsed = parseJsonWithFallback(stdout)
  if (!parsed) {
    console.log('\n== Parsed ==')
    console.log('stdout is not valid JSON')
    process.exitCode = exitCode === 0 ? 0 : 1
    return
  }

  const summary = {
    type: parsed.type,
    subtype: parsed.subtype,
    is_error: parsed.is_error,
    stop_reason: parsed.stop_reason,
    session_id: parsed.session_id,
    errors: parsed.errors,
    has_structured_output: Boolean(parsed.structured_output)
  }

  console.log('\n== Parsed Summary ==')
  console.log(JSON.stringify(summary, null, 2))

  if (parsed.structured_output !== undefined) {
    console.log('\n== structured_output ==')
    console.log(JSON.stringify(parsed.structured_output, null, 2))
  }

  if (parsed.result !== undefined) {
    console.log('\n== result ==')
    if (typeof parsed.result === 'string') {
      console.log(parsed.result)
    } else {
      console.log(JSON.stringify(parsed.result, null, 2))
    }
  }

  process.exitCode = exitCode === 0 ? 0 : 1
}

main().catch((error) => {
  console.error('test failed:', error instanceof Error ? error.message : String(error))
  process.exit(1)
})
