<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTaskStore } from '@/stores/task'
import { useNotificationStore } from '@/stores/notification'
import { getErrorMessage } from '@/utils/api'
import type { Task } from '@/types/plan'
import EaModal from '@/components/common/EaModal.vue'

const props = defineProps<{
  visible: boolean
  task: Task
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved'): void
}>()

const taskStore = useTaskStore()
const notificationStore = useNotificationStore()

// 表单数据
const form = ref({
  title: props.task.title,
  description: props.task.description || '',
  priority: props.task.priority
})

const isSaving = ref(false)

// 优先级选项
const priorityOptions = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' }
]

// 监听 task 变化，更新表单
watch(() => props.task, (newTask) => {
  form.value = {
    title: newTask.title,
    description: newTask.description || '',
    priority: newTask.priority
  }
}, { immediate: true })

// 保存编辑
async function handleSave() {
  if (!form.value.title.trim()) {
    notificationStore.error('保存失败', '请输入任务标题')
    return
  }

  try {
    isSaving.value = true
    await taskStore.updateTask(props.task.id, {
      title: form.value.title,
      description: form.value.description,
      priority: form.value.priority
    })

    notificationStore.success('保存成功', '任务已更新')
    emit('saved')
    close()
  } catch (error) {
    console.error('Failed to update task:', error)
    notificationStore.error('保存失败', getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

// 关闭对话框
function close() {
  emit('update:visible', false)
}
</script>

<template>
  <EaModal
    :visible="visible"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="task-edit-modal">
      <div class="modal-header">
        <h3>编辑任务</h3>
        <button
          class="btn-close"
          @click="close"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <div class="form-field">
          <label>标题 <span class="required">*</span></label>
          <input
            v-model="form.title"
            type="text"
            placeholder="任务标题"
          >
        </div>

        <div class="form-field">
          <label>描述</label>
          <textarea
            v-model="form.description"
            rows="3"
            placeholder="任务描述"
          />
        </div>

        <div class="form-field">
          <label>优先级</label>
          <div class="priority-select-wrap">
            <select
              v-model="form.priority"
              class="priority-select"
            >
              <option
                v-for="opt in priorityOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
            <svg
              class="select-arrow"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button
          class="btn btn-secondary"
          @click="close"
        >
          取消
        </button>
        <button
          class="btn btn-primary"
          :disabled="isSaving"
          @click="handleSave"
        >
          {{ isSaving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </EaModal>
</template>

<style scoped>
.task-edit-modal {
  width: min(680px, calc(100vw - 2rem));
  max-width: 100%;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.modal-header h3 {
  margin: 0;
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-1, 0.25rem);
  border: none;
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-close:hover {
  background-color: var(--color-surface-hover, #f8fafc);
  color: var(--color-text-primary, #1e293b);
}

.modal-body {
  padding: var(--spacing-4, 1rem);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3, 0.75rem);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2, 0.5rem);
}

.form-field label {
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #64748b);
}

.form-field .required {
  color: var(--color-error, #ef4444);
}

.form-field input,
.form-field textarea,
.form-field select {
  width: 100%;
  box-sizing: border-box;
  padding: var(--spacing-2, 0.5rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
}

.form-field input:focus,
.form-field textarea:focus,
.form-field select:focus {
  outline: none;
  border-color: var(--color-primary, #60a5fa);
}

.priority-select-wrap {
  position: relative;
}

.priority-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding-right: 2rem;
  cursor: pointer;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  transition: border-color var(--transition-fast, 150ms), box-shadow var(--transition-fast, 150ms);
}

.priority-select:hover {
  border-color: #cbd5e1;
}

.priority-select:focus {
  box-shadow: 0 0 0 3px rgb(59 130 246 / 15%);
}

.select-arrow {
  position: absolute;
  right: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  pointer-events: none;
  transition: transform var(--transition-fast, 150ms), color var(--transition-fast, 150ms);
}

.priority-select-wrap:focus-within .select-arrow {
  color: #3b82f6;
  transform: translateY(-50%) rotate(180deg);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2, 0.5rem);
  padding: var(--spacing-3, 0.75rem) var(--spacing-4, 1rem);
  border-top: 1px solid var(--color-border, #e2e8f0);
}

.btn {
  padding: var(--spacing-2, 0.5rem) var(--spacing-4, 1rem);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-primary {
  background-color: var(--color-primary, #3b82f6);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover, #2563eb);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
  border: 1px solid var(--color-border, #e2e8f0);
}

.btn-secondary:hover {
  background-color: var(--color-surface-hover, #f8fafc);
}
</style>
