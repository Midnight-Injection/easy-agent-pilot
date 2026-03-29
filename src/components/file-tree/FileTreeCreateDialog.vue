<script setup lang="ts">
/**
 * 文件树新建条目对话框。
 * 根据目标节点推断创建位置，统一处理新建文件和新建文件夹。
 */

import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon, EaInput } from '@/components/common'
import type { CreateEntryType, FileTreeNodeData } from './types'

interface Props {
  visible: boolean
  node: FileTreeNodeData | null
  entryType: CreateEntryType
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  confirm: [node: FileTreeNodeData, name: string, entryType: CreateEntryType]
  cancel: []
}>()

const { t } = useI18n()
const inputValue = ref('')
const inputRef = ref<{ focus: () => void; select: () => void } | null>(null)

const title = computed(() => (
  props.entryType === 'directory' ? t('fileTree.createFolder') : t('fileTree.createFile')
))

const placeholder = computed(() => (
  props.entryType === 'directory' ? t('fileTree.folderNamePlaceholder') : t('fileTree.fileNamePlaceholder')
))

const errorMessage = computed(() => {
  if (!inputValue.value.trim()) {
    return t('validation.nameRequired')
  }
  if (/[\\/]/.test(inputValue.value.trim())) {
    return t('fileTree.invalidName')
  }
  return null
})

watch(() => props.visible, async (visible) => {
  if (!visible) {
    inputValue.value = ''
    return
  }

  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
})

const handleClose = () => {
  inputValue.value = ''
  emit('update:visible', false)
}

const handleConfirm = () => {
  if (!props.node || errorMessage.value) {
    return
  }

  emit('confirm', props.node, inputValue.value.trim(), props.entryType)
  handleClose()
}

const handleCancel = () => {
  emit('cancel')
  handleClose()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="create-dialog-overlay"
        @click="handleCancel"
      >
        <div
          class="create-dialog"
          @click.stop
        >
          <div class="create-dialog__header">
            <EaIcon
              :name="entryType === 'directory' ? 'folder-plus' : 'file-plus'"
              :size="20"
              class="create-dialog__icon"
            />
            <h4 class="create-dialog__title">
              {{ title }}
            </h4>
          </div>

          <div class="create-dialog__content">
            <EaInput
              ref="inputRef"
              v-model="inputValue"
              :placeholder="placeholder"
              :error="errorMessage"
              autofocus
              @keydown.enter="handleConfirm"
              @keydown.esc="handleCancel"
            />
          </div>

          <div class="create-dialog__actions">
            <EaButton
              type="secondary"
              @click="handleCancel"
            >
              {{ t('common.cancel') }}
            </EaButton>
            <EaButton
              type="primary"
              :disabled="!!errorMessage"
              @click="handleConfirm"
            >
              {{ t('common.create') }}
            </EaButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.create-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.create-dialog {
  width: 360px;
  max-width: 90vw;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.create-dialog__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.create-dialog__icon {
  color: var(--color-primary);
}

.create-dialog__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.create-dialog__content {
  padding: var(--spacing-5);
}

.create-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-active .create-dialog,
.modal-leave-active .create-dialog {
  transition: transform var(--transition-normal) var(--easing-default),
              opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .create-dialog,
.modal-leave-to .create-dialog {
  transform: scale(0.95);
  opacity: 0;
}
</style>
