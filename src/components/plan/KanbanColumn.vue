<script setup lang="ts">
import { ref } from 'vue'
import KanbanCard from './KanbanCard.vue'
import { useTaskStore } from '@/stores/task'
import type { Task, TaskStatus } from '@/types/plan'

const props = withDefaults(defineProps<{
  status: TaskStatus
  title: string
  color: string
  tasks: Task[]
  canDrop?: boolean
  showBatchStart?: boolean
}>(), {
  canDrop: true,
  showBatchStart: false
})

const emit = defineEmits<{
  (e: 'taskDrop', taskId: string, status: TaskStatus): void
  (e: 'taskClick', task: Task): void
  (e: 'taskStop', task: Task): void
  (e: 'taskRetry', task: Task): void
  (e: 'taskEdit', task: Task): void
  (e: 'taskDelete', task: Task): void
  (e: 'batchStart'): void
  (e: 'taskReorder', taskId: string, targetIndex: number): void
}>()

const taskStore = useTaskStore()

// 是否正在拖拽到此列
const isDragOver = ref(false)
// 当前拖拽悬停的目标索引（基于移除前数组）
const dragOverIndex = ref<number | null>(null)

function resolveDragTaskId(event: DragEvent): string {
  return taskStore.draggingTaskId || event.dataTransfer?.getData('text/plain') || ''
}

function clearDragState() {
  isDragOver.value = false
  dragOverIndex.value = null
  taskStore.draggingTaskId = null
}

// 处理拖拽经过
function handleDragOver(event: DragEvent) {
  if (props.canDrop === false) return
  event.preventDefault()

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }

  const currentTarget = event.currentTarget as HTMLElement
  const columnBody = currentTarget.classList.contains('column-body')
    ? currentTarget
    : currentTarget.querySelector('.column-body')
  if (!columnBody) return

  const cards = Array.from(columnBody.querySelectorAll<HTMLElement>('.kanban-card'))

  // 插入点使用“移除前”的索引范围：0..cards.length
  let targetIndex = cards.length
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect()
    if (event.clientY < rect.top + rect.height / 2) {
      targetIndex = i
      break
    }
  }

  dragOverIndex.value = targetIndex
}

// 处理拖拽进入
function handleDragEnter(event: DragEvent) {
  if (props.canDrop === false) return
  event.preventDefault()
  isDragOver.value = true
}

// 处理拖拽离开
function handleDragLeave(event: DragEvent) {
  // 检查是否真的离开了列区域
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = event.clientX
  const y = event.clientY
  if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
    isDragOver.value = false
    dragOverIndex.value = null
  }
}

// 处理放下
function handleDrop(event: DragEvent) {
  if (props.canDrop === false) return
  event.preventDefault()

  const taskId = resolveDragTaskId(event)
  if (!taskId) {
    clearDragState()
    return
  }

  const taskInThisColumn = props.tasks.some(t => t.id === taskId)
  if (taskInThisColumn) {
    const targetIndex = dragOverIndex.value ?? props.tasks.length
    emit('taskReorder', taskId, targetIndex)
  } else {
    emit('taskDrop', taskId, props.status)
  }

  clearDragState()
}

// 处理任务拖拽开始
function handleTaskDragStart(task: Task, event: DragEvent) {
  taskStore.draggingTaskId = task.id

  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', task.id)
    event.dataTransfer.effectAllowed = 'move'
  }

  if (event.target) {
    (event.target as HTMLElement).classList.add('dragging')
  }
}

// 处理任务拖拽结束
function handleTaskDragEnd(event: DragEvent) {
  if (event.target) {
    (event.target as HTMLElement).classList.remove('dragging')
  }

  isDragOver.value = false
  dragOverIndex.value = null

  // 拖拽取消时，兜底清理全局状态
  setTimeout(() => {
    if (taskStore.draggingTaskId) {
      taskStore.draggingTaskId = null
    }
  }, 500)
}

// 处理任务点击
function handleTaskClick(task: Task) {
  emit('taskClick', task)
}

// 处理停止任务
function handleTaskStop(task: Task) {
  emit('taskStop', task)
}

// 处理重试任务
function handleTaskRetry(task: Task) {
  emit('taskRetry', task)
}

// 处理编辑任务
function handleTaskEdit(task: Task) {
  emit('taskEdit', task)
}

// 处理删除任务
function handleTaskDelete(task: Task) {
  emit('taskDelete', task)
}

// 处理批量启动
function handleBatchStart() {
  emit('batchStart')
}
</script>

<template>
  <div
    class="kanban-column"
    :class="{ 'drag-over': isDragOver }"
  >
    <div class="column-header">
      <div class="header-left">
        <span
          class="column-dot"
          :class="color"
        />
        <span class="column-label">{{ title }}</span>
        <span class="column-count">{{ tasks.length }}</span>
      </div>

      <!-- 批量启动按钮 - 仅待办列显示 -->
      <button
        v-if="showBatchStart && tasks.length > 0"
        class="btn-batch-start"
        title="批量启动所有待办任务"
        @click="handleBatchStart"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        全部启动
      </button>
    </div>

    <div
      class="column-body"
      @dragover="handleDragOver"
      @dragenter="handleDragEnter"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <template
        v-for="(task, index) in tasks"
        :key="task.id"
      >
        <div
          class="task-item"
          :class="{ 'drop-before': isDragOver && dragOverIndex === index }"
        >
          <div
            v-if="isDragOver && dragOverIndex === index"
            class="drop-indicator between"
          />
          <KanbanCard
            :task="task"
            :draggable="task.status !== 'in_progress'"
            @drag-start="handleTaskDragStart"
            @drag-end="handleTaskDragEnd"
            @card-drag-over="handleDragOver"
            @card-drag-enter="handleDragEnter"
            @card-drag-leave="handleDragLeave"
            @card-drop="handleDrop"
            @click="handleTaskClick"
            @stop="handleTaskStop"
            @retry="handleTaskRetry"
            @edit="handleTaskEdit"
            @delete="handleTaskDelete"
          />
        </div>
      </template>

      <!-- 拖拽指示器 -->
      <div
        v-if="isDragOver && dragOverIndex === tasks.length"
        class="drop-indicator tail"
      />

      <div
        v-if="tasks.length === 0"
        class="empty-column"
      >
        <div
          v-if="isDragOver"
          class="drop-indicator empty"
        />
        <span>暂无任务</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kanban-column {
  flex: 1;
  min-width: 280px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-tertiary, #f1f5f9);
  border-radius: var(--radius-lg, 12px);
  transition: background-color var(--transition-fast, 150ms);
  border: 2px solid transparent;
}

.kanban-column.drag-over {
  background-color: var(--color-primary-light, #dbeafe);
  border-color: var(--color-primary, #3b82f6);
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3, 0.75rem);
  font-weight: var(--font-weight-semibold, 600);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.column-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.column-dot.gray { background-color: #94a3b8; }
.column-dot.blue { background-color: #3b82f6; }
.column-dot.green { background-color: #10b981; }
.column-dot.red { background-color: #ef4444; }
.column-dot.orange { background-color: #f59e0b; }

.column-label {
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-primary, #1e293b);
}

.column-count {
  padding: 0.125rem 0.5rem;
  background-color: var(--color-surface, #fff);
  border-radius: var(--radius-full, 9999px);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #64748b);
  box-shadow: var(--shadow-xs, 0 1px 2px 0 rgb(0 0 0 / 0.05));
}

.btn-batch-start {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background-color: var(--color-primary, #3b82f6);
  color: white;
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-batch-start:hover {
  background-color: var(--color-primary-hover, #2563eb);
}

.column-body {
  flex: 1;
  padding: var(--spacing-2, 0.5rem);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2, 0.5rem);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border, #e2e8f0) transparent;
}

.column-body::-webkit-scrollbar {
  width: 6px;
}

.column-body::-webkit-scrollbar-track {
  background: transparent;
}

.column-body::-webkit-scrollbar-thumb {
  background-color: var(--color-border, #e2e8f0);
  border-radius: var(--radius-full, 9999px);
}

.task-item {
  position: relative;
  transition: padding-top var(--transition-fast, 150ms) ease;
}

.task-item.drop-before {
  padding-top: 10px;
}

.empty-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4, 1rem);
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-tertiary, #94a3b8);
  min-height: 80px;
  border: 2px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  margin: var(--spacing-2, 0.5rem);
}

/* 拖拽中的卡片样式 */
.column-body :deep(.kanban-card.dragging) {
  opacity: 0.5;
  transform: scale(0.95);
}

.drop-indicator {
  height: 0;
  pointer-events: none;
}

.drop-indicator::before {
  content: '';
  display: block;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%);
  box-shadow: 0 0 0 1px rgb(59 130 246 / 18%), 0 4px 12px rgb(59 130 246 / 25%);
  transform-origin: left center;
  animation: drop-line-enter 180ms ease-out, pulse 1.1s ease-in-out infinite;
}

.drop-indicator.between {
  margin: 0 4px 4px;
}

.drop-indicator.tail {
  margin: 4px;
}

.drop-indicator.empty {
  width: 100%;
  margin-bottom: 12px;
  align-self: stretch;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

@keyframes drop-line-enter {
  0% {
    transform: scaleX(0.25);
    opacity: 0;
  }
  100% {
    transform: scaleX(1);
    opacity: 1;
  }
}
</style>
