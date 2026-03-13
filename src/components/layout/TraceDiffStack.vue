<script setup lang="ts">
import { computed } from 'vue'
import type { FileEditChangeType, FileEditRange } from '@/types/fileTrace'

type DiffOpType = 'equal' | 'remove' | 'add'
type DiffRowVariant = 'neutral' | 'removed' | 'added'

interface DiffOp {
  type: DiffOpType
  text: string
}

interface DiffRow {
  marker: '+' | '-' | '·'
  lineNumber: number | null
  text: string
  variant: DiffRowVariant
}

const props = withDefaults(defineProps<{
  beforeContent: string
  afterContent: string
  changeType: FileEditChangeType
  focusRange?: FileEditRange | null
}>(), {
  focusRange: null
})

function normalizeLines(content: string): string[] {
  if (!content) {
    return []
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n')
  if (lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines
}

function sliceWindow(lines: string[], range: FileEditRange | null, context: number) {
  if (!range || lines.length <= 18) {
    return {
      lines,
      startLine: 1
    }
  }

  const start = Math.max(0, range.startLine - 1 - context)
  const end = Math.min(lines.length, range.endLine + context)

  return {
    lines: lines.slice(start, end),
    startLine: start + 1
  }
}

function buildDiffOps(beforeLines: string[], afterLines: string[]): DiffOp[] {
  const dp = Array.from({ length: beforeLines.length + 1 }, () =>
    Array<number>(afterLines.length + 1).fill(0)
  )

  for (let i = beforeLines.length - 1; i >= 0; i -= 1) {
    for (let j = afterLines.length - 1; j >= 0; j -= 1) {
      if (beforeLines[i] === afterLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0

  while (i < beforeLines.length && j < afterLines.length) {
    if (beforeLines[i] === afterLines[j]) {
      ops.push({ type: 'equal', text: beforeLines[i] })
      i += 1
      j += 1
      continue
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'remove', text: beforeLines[i] })
      i += 1
      continue
    }

    ops.push({ type: 'add', text: afterLines[j] })
    j += 1
  }

  while (i < beforeLines.length) {
    ops.push({ type: 'remove', text: beforeLines[i] })
    i += 1
  }

  while (j < afterLines.length) {
    ops.push({ type: 'add', text: afterLines[j] })
    j += 1
  }

  return ops
}

function buildBeforeRows(ops: DiffOp[], startLine: number): DiffRow[] {
  const rows: DiffRow[] = []
  let lineNumber = startLine

  for (const op of ops) {
    if (op.type === 'add') {
      continue
    }

    rows.push({
      marker: op.type === 'remove' ? '-' : '·',
      lineNumber,
      text: op.text,
      variant: op.type === 'remove' ? 'removed' : 'neutral'
    })
    lineNumber += 1
  }

  return rows
}

function buildAfterRows(ops: DiffOp[], startLine: number): DiffRow[] {
  const rows: DiffRow[] = []
  let lineNumber = startLine

  for (const op of ops) {
    if (op.type === 'remove') {
      continue
    }

    rows.push({
      marker: op.type === 'add' ? '+' : '·',
      lineNumber,
      text: op.text,
      variant: op.type === 'add' ? 'added' : 'neutral'
    })
    lineNumber += 1
  }

  return rows
}

const beforeWindow = computed(() => sliceWindow(normalizeLines(props.beforeContent), props.focusRange, 4))
const afterWindow = computed(() => sliceWindow(normalizeLines(props.afterContent), props.focusRange, 4))
const diffOps = computed(() => buildDiffOps(beforeWindow.value.lines, afterWindow.value.lines))
const beforeRows = computed(() => buildBeforeRows(diffOps.value, beforeWindow.value.startLine))
const afterRows = computed(() => buildAfterRows(diffOps.value, afterWindow.value.startLine))
const diffStats = computed(() => diffOps.value.reduce((stats, op) => {
  if (op.type === 'add') {
    stats.added += 1
  } else if (op.type === 'remove') {
    stats.removed += 1
  }

  return stats
}, {
  added: 0,
  removed: 0
}))
</script>

<template>
  <div class="trace-diff-stack">
    <div
      v-if="changeType === 'modify' && (diffStats.added > 0 || diffStats.removed > 0)"
      class="trace-diff-stack__summary"
    >
      <span class="trace-diff-stack__summary-chip trace-diff-stack__summary-chip--removed">
        - {{ diffStats.removed }} 行
      </span>
      <span class="trace-diff-stack__summary-chip trace-diff-stack__summary-chip--added">
        + {{ diffStats.added }} 行
      </span>
    </div>

    <section class="trace-diff-stack__panel">
      <header class="trace-diff-stack__header trace-diff-stack__header--before">
        <span>修改前</span>
        <span class="trace-diff-stack__header-tag">
          {{ changeType === 'create' ? '文件不存在' : '历史版本' }}
        </span>
      </header>

      <div
        v-if="changeType === 'create'"
        class="trace-diff-stack__empty"
      >
        创建文件前没有内容
      </div>

      <div
        v-else
        class="trace-diff-stack__rows"
      >
        <div
          v-for="(row, index) in beforeRows"
          :key="`before-${index}-${row.lineNumber}`"
          class="trace-diff-stack__row"
          :class="{
            'trace-diff-stack__row--removed': row.variant === 'removed',
            'trace-diff-stack__row--neutral': row.variant === 'neutral'
          }"
        >
          <span class="trace-diff-stack__marker">{{ row.marker }}</span>
          <span class="trace-diff-stack__line">{{ row.lineNumber }}</span>
          <code class="trace-diff-stack__code">{{ row.text || ' ' }}</code>
        </div>
      </div>
    </section>

    <section class="trace-diff-stack__panel">
      <header class="trace-diff-stack__header trace-diff-stack__header--after">
        <span>AI 修改后</span>
        <span class="trace-diff-stack__header-tag">
          {{ changeType === 'delete' ? '文件已删除' : '当前结果' }}
        </span>
      </header>

      <div
        v-if="changeType === 'delete'"
        class="trace-diff-stack__empty trace-diff-stack__empty--danger"
      >
        这次改动会删除整个文件
      </div>

      <div
        v-else
        class="trace-diff-stack__rows"
      >
        <div
          v-for="(row, index) in afterRows"
          :key="`after-${index}-${row.lineNumber}`"
          class="trace-diff-stack__row"
          :class="{
            'trace-diff-stack__row--added': row.variant === 'added',
            'trace-diff-stack__row--neutral': row.variant === 'neutral'
          }"
        >
          <span class="trace-diff-stack__marker">{{ row.marker }}</span>
          <span class="trace-diff-stack__line">{{ row.lineNumber }}</span>
          <code class="trace-diff-stack__code">{{ row.text || ' ' }}</code>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.trace-diff-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  flex: 1;
  padding: 16px;
  overflow: auto;
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.08), transparent 28%),
    linear-gradient(180deg, color-mix(in srgb, var(--color-surface-hover) 72%, transparent), var(--color-surface));
}

.trace-diff-stack__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.trace-diff-stack__summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.16);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.trace-diff-stack__summary-chip--removed {
  color: #b91c1c;
  background: rgba(254, 226, 226, 0.72);
}

.trace-diff-stack__summary-chip--added {
  color: #15803d;
  background: rgba(220, 252, 231, 0.76);
}

.trace-diff-stack__panel {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 18px;
  overflow: hidden;
  background: color-mix(in srgb, var(--color-surface) 94%, white 6%);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.06);
}

.trace-diff-stack__header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  font-size: 12px;
  font-weight: 700;
}

.trace-diff-stack__header--before {
  background: linear-gradient(180deg, rgba(254, 242, 242, 0.9), rgba(255, 255, 255, 0.96));
  color: #991b1b;
}

.trace-diff-stack__header--after {
  background: linear-gradient(180deg, rgba(240, 253, 244, 0.94), rgba(255, 255, 255, 0.96));
  color: #166534;
}

.trace-diff-stack__header-tag {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.74;
}

.trace-diff-stack__rows {
  overflow: auto;
}

.trace-diff-stack__row {
  display: grid;
  grid-template-columns: 24px 56px minmax(0, 1fr);
  align-items: stretch;
  min-height: 28px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.72);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.trace-diff-stack__row:last-child {
  border-bottom: none;
}

.trace-diff-stack__row--neutral {
  background: color-mix(in srgb, var(--color-surface-hover) 78%, transparent);
}

.trace-diff-stack__row--removed {
  background: rgba(254, 226, 226, 0.65);
}

.trace-diff-stack__row--added {
  background: rgba(220, 252, 231, 0.7);
}

.trace-diff-stack__marker,
.trace-diff-stack__line {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid rgba(226, 232, 240, 0.8);
  color: var(--color-text-tertiary);
  user-select: none;
}

.trace-diff-stack__marker {
  font-weight: 800;
}

.trace-diff-stack__row--removed .trace-diff-stack__marker {
  color: #dc2626;
}

.trace-diff-stack__row--added .trace-diff-stack__marker {
  color: #16a34a;
}

.trace-diff-stack__code {
  padding: 6px 12px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text-primary);
  background: transparent;
}

.trace-diff-stack__empty {
  padding: 18px 16px;
  font-size: 13px;
  color: var(--color-text-secondary);
  background: rgba(248, 250, 252, 0.84);
}

.trace-diff-stack__empty--danger {
  color: #b91c1c;
  background: rgba(254, 242, 242, 0.86);
}

:global([data-theme='dark']) .trace-diff-stack,
:global(.dark) .trace-diff-stack {
  background:
    radial-gradient(circle at top right, rgba(96, 165, 250, 0.1), transparent 26%),
    linear-gradient(180deg, rgba(15, 23, 42, 0.64), rgba(2, 6, 23, 0.84));
}

:global([data-theme='dark']) .trace-diff-stack__summary-chip,
:global(.dark) .trace-diff-stack__summary-chip {
  border-color: rgba(71, 85, 105, 0.55);
}

:global([data-theme='dark']) .trace-diff-stack__summary-chip--removed,
:global(.dark) .trace-diff-stack__summary-chip--removed {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.46);
}

:global([data-theme='dark']) .trace-diff-stack__summary-chip--added,
:global(.dark) .trace-diff-stack__summary-chip--added {
  color: #bbf7d0;
  background: rgba(20, 83, 45, 0.5);
}

:global([data-theme='dark']) .trace-diff-stack__panel,
:global(.dark) .trace-diff-stack__panel {
  border-color: rgba(71, 85, 105, 0.5);
  background: rgba(15, 23, 42, 0.84);
  box-shadow: 0 12px 28px rgba(2, 6, 23, 0.34);
}

:global([data-theme='dark']) .trace-diff-stack__header,
:global(.dark) .trace-diff-stack__header {
  border-bottom-color: rgba(71, 85, 105, 0.5);
}

:global([data-theme='dark']) .trace-diff-stack__header--before,
:global(.dark) .trace-diff-stack__header--before {
  background: linear-gradient(180deg, rgba(127, 29, 29, 0.54), rgba(15, 23, 42, 0.92));
  color: #fecaca;
}

:global([data-theme='dark']) .trace-diff-stack__header--after,
:global(.dark) .trace-diff-stack__header--after {
  background: linear-gradient(180deg, rgba(20, 83, 45, 0.58), rgba(15, 23, 42, 0.92));
  color: #bbf7d0;
}

:global([data-theme='dark']) .trace-diff-stack__row,
:global(.dark) .trace-diff-stack__row {
  border-bottom-color: rgba(51, 65, 85, 0.72);
}

:global([data-theme='dark']) .trace-diff-stack__row--neutral,
:global(.dark) .trace-diff-stack__row--neutral {
  background: rgba(15, 23, 42, 0.46);
}

:global([data-theme='dark']) .trace-diff-stack__row--removed,
:global(.dark) .trace-diff-stack__row--removed {
  background: rgba(127, 29, 29, 0.34);
}

:global([data-theme='dark']) .trace-diff-stack__row--added,
:global(.dark) .trace-diff-stack__row--added {
  background: rgba(20, 83, 45, 0.32);
}

:global([data-theme='dark']) .trace-diff-stack__marker,
:global([data-theme='dark']) .trace-diff-stack__line,
:global(.dark) .trace-diff-stack__marker,
:global(.dark) .trace-diff-stack__line {
  border-right-color: rgba(51, 65, 85, 0.76);
}

:global([data-theme='dark']) .trace-diff-stack__code,
:global(.dark) .trace-diff-stack__code {
  color: #e2e8f0;
}

:global([data-theme='dark']) .trace-diff-stack__empty,
:global(.dark) .trace-diff-stack__empty {
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.72);
}

:global([data-theme='dark']) .trace-diff-stack__empty--danger,
:global(.dark) .trace-diff-stack__empty--danger {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.36);
}

@media (max-width: 768px) {
  .trace-diff-stack {
    padding: 10px;
  }

  .trace-diff-stack__row {
    grid-template-columns: 20px 44px minmax(0, 1fr);
    font-size: 11px;
  }

  .trace-diff-stack__header {
    padding: 10px 12px;
  }
}
</style>
