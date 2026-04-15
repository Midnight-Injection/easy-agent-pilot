<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaInput, EaModal } from '@/components/common'
import EaSelect, { type SelectOption } from '@/components/common/EaSelect.vue'
import ExecutionTimeline from '@/components/message/ExecutionTimeline.vue'
import { useMemoryAuthoringDialog } from './memoryAuthoringDialog/useMemoryAuthoringDialog'

const props = defineProps<{
  dialog: ReturnType<typeof useMemoryAuthoringDialog>
}>()

const { t } = useI18n()
const dialog = props.dialog
const {
  visible,
  isRunning,
  draftName,
  draftDescription,
  draftMarkdown,
  instruction,
  selectedExpertId,
  selectedRecordCount,
  canGenerateInitialDraft,
  canConfirm,
  canTriggerGeneration,
  messagesContainerRef,
  timelineEntries,
  runtimeStatusText
} = dialog

const expertOptions = computed<SelectOption[]>(() =>
  dialog.availableExperts.value.map(expert => ({
    value: expert.id,
    label: expert.name
  }))
)

function handleVisibleChange(nextVisible: boolean) {
  if (!nextVisible) {
    dialog.closeDialog()
  }
}

function handleInstructionKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
    return
  }

  event.preventDefault()
  if (!canTriggerGeneration.value) {
    return
  }

  void dialog.submitInstruction()
}
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="memory-authoring-dialog"
    overlay-class="memory-authoring-dialog__overlay"
    @update:visible="handleVisibleChange"
  >
    <template #header>
      <div class="memory-authoring-dialog__header">
        <div>
          <p class="memory-authoring-dialog__eyebrow">
            {{ t('memory.authoring.eyebrow') }}
          </p>
          <h3 class="memory-authoring-dialog__title">
            {{ t('memory.authoring.title') }}
          </h3>
        </div>
        <button
          type="button"
          class="memory-authoring-dialog__close"
          @click="dialog.closeDialog"
        >
          ×
        </button>
      </div>
    </template>

    <div class="memory-authoring-workspace">
      <section class="memory-authoring-pane memory-authoring-pane--conversation">
        <div
          ref="messagesContainerRef"
          class="memory-authoring-timeline"
        >
          <ExecutionTimeline
            v-if="timelineEntries.length"
            :entries="timelineEntries"
            group-tool-calls
          />

          <div
            v-if="isRunning"
            class="memory-authoring-running"
          >
            <span class="memory-authoring-running__spinner" />
            <span>{{ runtimeStatusText || t('memory.authoring.running') }}</span>
          </div>
        </div>

        <div class="memory-authoring-composer">
          <div class="memory-authoring-composer__head">
            <label class="memory-authoring-field memory-authoring-field--agent">
              <EaSelect
                v-model="selectedExpertId"
                :options="expertOptions"
                :placeholder="t('memory.authoring.agentLabel')"
              />
            </label>

            <div class="memory-authoring-composer__meta">
              <EaButton
                v-if="selectedRecordCount > 0"
                type="secondary"
                size="small"
                :disabled="!canGenerateInitialDraft"
                @click="dialog.generateInitialDraft"
              >
                {{ t('memory.authoring.generateDraft') }}
              </EaButton>
              <EaButton
                v-if="isRunning"
                type="danger"
                size="small"
                @click="dialog.stopGeneration"
              >
                {{ t('memory.authoring.stop') }}
              </EaButton>
            </div>
          </div>

          <div class="memory-authoring-composer__input-wrap">
            <textarea
              v-model="instruction"
              class="memory-authoring-composer__input"
              :disabled="isRunning"
              rows="3"
              :placeholder="t('memory.authoring.inputPlaceholder')"
              @keydown="handleInstructionKeydown"
            />
          </div>
        </div>
      </section>

      <section class="memory-authoring-pane memory-authoring-pane--draft">
        <div class="memory-authoring-draft__meta">
          <label class="memory-authoring-field">
            <span>{{ t('memory.authoring.nameLabel') }}</span>
            <EaInput
              v-model="draftName"
              :placeholder="t('memory.authoring.namePlaceholder')"
            />
          </label>

          <label class="memory-authoring-field">
            <span>{{ t('memory.authoring.descriptionLabel') }}</span>
            <textarea
              v-model="draftDescription"
              class="memory-authoring-draft__description"
              rows="3"
              :placeholder="t('memory.authoring.descriptionPlaceholder')"
            />
          </label>
        </div>

        <div class="memory-authoring-draft__body">
          <textarea
            v-model="draftMarkdown"
            class="memory-authoring-draft__editor"
          />
        </div>
      </section>
    </div>

    <template #footer>
      <div class="memory-authoring-footer">
        <div class="memory-authoring-footer__actions">
          <EaButton
            type="secondary"
            @click="dialog.closeDialog"
          >
            {{ t('common.cancel') }}
          </EaButton>
          <EaButton
            :disabled="!canConfirm"
            @click="dialog.confirmCreate"
          >
            {{ t('common.create') }}
          </EaButton>
        </div>
      </div>
    </template>
  </EaModal>
</template>

<style>
.memory-authoring-dialog__overlay {
  backdrop-filter: blur(10px);
  background: rgba(15, 23, 42, 0.4);
}

.ea-modal.memory-authoring-dialog {
  width: min(1480px, calc(100vw - 24px)) !important;
  max-width: min(1480px, calc(100vw - 24px)) !important;
  min-width: min(1240px, calc(100vw - 24px)) !important;
  height: min(900px, calc(100vh - 24px)) !important;
  max-height: min(900px, calc(100vh - 24px)) !important;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 30px;
  background:
    radial-gradient(circle at top right, rgba(20, 184, 166, 0.08), transparent 30%),
    radial-gradient(circle at bottom left, rgba(59, 130, 246, 0.08), transparent 26%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.97));
  box-shadow: 0 40px 120px rgba(15, 23, 42, 0.18);
}

.memory-authoring-dialog .ea-modal__header {
  padding: 20px 26px 18px;
}

.memory-authoring-dialog .ea-modal__body {
  padding: 0;
}

.memory-authoring-dialog .ea-modal__footer {
  padding: 10px 26px 14px;
}

.memory-authoring-dialog__header,
.memory-authoring-footer,
.memory-authoring-footer__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.memory-authoring-dialog__eyebrow {
  margin: 0 0 6px;
  color: var(--color-text-secondary);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.memory-authoring-dialog__title {
  margin: 0;
  font-size: 28px;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  color: var(--color-text-primary);
}

.memory-authoring-dialog__close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  color: var(--color-text-primary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.memory-authoring-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.16fr) minmax(0, 0.84fr);
  min-height: 0;
  height: 100%;
}

.memory-authoring-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 26px 10px;
}

.memory-authoring-pane--conversation {
  border-right: 1px solid rgba(148, 163, 184, 0.18);
}

.memory-authoring-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  color: var(--color-text-secondary);
  font-size: 12px;
}

.memory-authoring-field--agent {
  flex: 1;
}

.memory-authoring-field span {
  color: var(--color-text-primary);
  font-weight: 600;
}

.memory-authoring-timeline,
.memory-authoring-draft__body {
  min-height: 0;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.62);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.04);
}

.memory-authoring-timeline {
  flex: 1;
  overflow: auto;
  padding: 10px 12px;
}

.memory-authoring-running {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

.memory-authoring-running__spinner {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #0f766e;
  box-shadow: 0 0 0 0 rgba(15, 118, 110, 0.3);
  animation: memory-authoring-pulse 1.2s ease infinite;
}

.memory-authoring-composer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: auto;
}

.memory-authoring-composer__head,
.memory-authoring-composer__meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.memory-authoring-composer__head {
  justify-content: space-between;
  align-items: flex-end;
}

.memory-authoring-composer__meta {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.memory-authoring-composer__input,
.memory-authoring-draft__description,
.memory-authoring-draft__editor {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.84);
  color: var(--color-text-primary);
  outline: none;
}

.memory-authoring-composer__input,
.memory-authoring-draft__description {
  resize: none;
  padding: 12px 15px;
  font: inherit;
  line-height: 1.68;
}

.memory-authoring-composer__input:focus,
.memory-authoring-draft__description:focus,
.memory-authoring-draft__editor:focus {
  border-color: rgba(15, 118, 110, 0.42);
  box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.12);
}

.memory-authoring-draft__meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

.memory-authoring-draft__body {
  flex: 1;
  overflow: hidden;
}

.memory-authoring-draft__editor {
  height: 100%;
  resize: none;
  padding: 18px;
  border: none;
  border-radius: 0;
  background: transparent;
  font: 500 14px/1.8 var(--font-family-mono, "SFMono-Regular", Consolas, monospace);
}

@keyframes memory-authoring-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(15, 118, 110, 0.3);
  }

  70% {
    box-shadow: 0 0 0 8px rgba(15, 118, 110, 0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(15, 118, 110, 0);
  }
}

@media (max-width: 1200px) {
  .ea-modal.memory-authoring-dialog {
    min-width: auto !important;
    height: min(920px, calc(100vh - 16px)) !important;
    max-height: min(920px, calc(100vh - 16px)) !important;
  }

  .memory-authoring-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .memory-authoring-pane--conversation {
    border-right: none;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  }

  .memory-authoring-composer__head {
    flex-direction: column;
    align-items: stretch;
  }

  .memory-authoring-composer__meta {
    justify-content: flex-start;
  }

  .memory-authoring-pane {
    padding-bottom: 12px;
  }
}
</style>
