<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon, EaModal } from '@/components/common'

interface AddModeOption {
  id: string
  label: string
  description: string
  icon?: string
}

defineProps<{
  visible: boolean
  title: string
  description?: string
  options: AddModeOption[]
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  select: [id: string]
}>()

const { t } = useI18n()

function close() {
  emit('update:visible', false)
}

function handleSelect(id: string) {
  emit('select', id)
  close()
}
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="add-mode-picker-modal"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <div class="add-mode-picker-modal__header">
        <div class="add-mode-picker-modal__title">
          <EaIcon name="lucide:plus-circle" />
          <span>{{ title }}</span>
        </div>
        <button
          type="button"
          class="add-mode-picker-modal__close"
          @click="close"
        >
          <EaIcon name="lucide:x" />
        </button>
      </div>
    </template>

    <div class="add-mode-picker-modal__body">
      <p
        v-if="description"
        class="add-mode-picker-modal__description"
      >
        {{ description }}
      </p>

      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="add-mode-picker-modal__option"
        @click="handleSelect(option.id)"
      >
        <div class="add-mode-picker-modal__option-main">
          <div class="add-mode-picker-modal__option-icon">
            <EaIcon :name="option.icon || 'lucide:sparkles'" />
          </div>
          <div class="add-mode-picker-modal__option-text">
            <span class="add-mode-picker-modal__option-label">{{ option.label }}</span>
            <span class="add-mode-picker-modal__option-description">{{ option.description }}</span>
          </div>
        </div>
        <EaIcon
          name="lucide:chevron-right"
          class="add-mode-picker-modal__option-arrow"
        />
      </button>
    </div>

    <template #footer>
      <EaButton
        type="ghost"
        @click="close"
      >
        {{ t('common.cancel') }}
      </EaButton>
    </template>
  </EaModal>
</template>

<style scoped>
:deep(.add-mode-picker-modal) {
  width: min(560px, calc(100vw - var(--spacing-8)));
}

.add-mode-picker-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
}

.add-mode-picker-modal__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.add-mode-picker-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  color: var(--color-text-tertiary);
}

.add-mode-picker-modal__close:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.add-mode-picker-modal__body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.add-mode-picker-modal__description {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.6;
}

.add-mode-picker-modal__option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-4);
  width: 100%;
  padding: var(--spacing-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, var(--color-surface), var(--color-background-secondary));
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}

.add-mode-picker-modal__option:hover {
  border-color: rgba(99, 102, 241, 0.36);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.add-mode-picker-modal__option-main {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
}

.add-mode-picker-modal__option-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.85rem;
  background: rgba(99, 102, 241, 0.1);
  color: #4f46e5;
  flex-shrink: 0;
}

.add-mode-picker-modal__option-text {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  text-align: left;
}

.add-mode-picker-modal__option-label {
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.add-mode-picker-modal__option-description {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.55;
}

.add-mode-picker-modal__option-arrow {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}
</style>
