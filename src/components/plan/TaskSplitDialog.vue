<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import TaskSplitPreview from './TaskSplitPreview.vue'
import TaskListOptimizeModal from './TaskListOptimizeModal.vue'
import ExecutionTimeline from '@/components/message/ExecutionTimeline.vue'
import { useTaskSplitDialog } from './taskSplitDialog/useTaskSplitDialog'
const { t } = useI18n()
 
const {
  planStore,
  taskSplitStore,
  isDarkTheme,
  isConfirming,
  messagesContainerRef,
  userInstruction,
  instructionInputRef,
  showMentionSuggestions,
  mentionSuggestions,
  selectedMentionOptionIndex,
  optimizeListModalVisible,
  showPreview,
  refinementMode,
  hasPendingRefinement,
  isListOptimizePending,
  isSubSplitActive,
  subSplitTargetTitle,
  previewActionsDisabled,
  canApplyRefinement,
  isSessionRunning,
  showStopButton,
  showLoadingIndicator,
  canRetrySplit,
  canContinueSplit,
  retryActionLabel,
  primaryActionLabel,
  footerHint,
  runningStatusText,
  timelineEntries,
  restartSplit,
  handleTimelineFormSubmit,
  handleOptimizeList,
  handleOptimizeListConfirm,
  confirmSplit,
  closeDialog,
  stopSplitTask,
  retrySplitTask,
  continueSplitTask,
  handleUserInstruction,
  handleInstructionInput,
  handleInstructionKeydown,
  handleInstructionCaretChange,
  applyMentionSuggestion,
  handleOverlayPointerDown,
  handleOverlayClick
} = useTaskSplitDialog()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="planStore.splitDialogVisible"
      class="split-dialog-overlay"
      :class="{ 'split-dialog-overlay--dark': isDarkTheme }"
      @pointerdown.capture="handleOverlayPointerDown"
      @click.self="handleOverlayClick"
    >
      <div
        class="split-dialog"
        :class="{ 'split-dialog--dark': isDarkTheme }"
      >
        <div class="dialog-header">
          <h4>
            <span class="dialog-icon">✂️</span>
            {{ t('taskSplit.dialogTitle') }}
          </h4>
          <button
            class="btn-close"
            @click="closeDialog"
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

        <div class="dialog-body">
          <div class="split-content">
            <div class="conversation-pane">
              <div
                ref="messagesContainerRef"
                class="messages-container"
              >
                <ExecutionTimeline
                  :entries="timelineEntries"
                  group-tool-calls
                  :form-cancel-text="t('taskSplit.hide')"
                  @form-submit="handleTimelineFormSubmit"
                  @form-cancel="closeDialog"
                  @message-form-submit="(_formId, values) => handleTimelineFormSubmit('', values)"
                />

                <div
                  v-if="showLoadingIndicator"
                  class="message assistant"
                >
                  <div class="message-content loading">
                    <span class="dot" />
                    <span class="dot" />
                    <span class="dot" />
                  </div>
                  <div class="message-loading-status">
                    {{ runningStatusText }}
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="showPreview"
              class="preview-pane"
            >
              <div
                v-if="isSubSplitActive && isSessionRunning"
                class="preview-resplit-overlay"
              >
                <div class="resplit-overlay-spinner" />
                <span class="resplit-overlay-text">{{ t('taskSplit.resplitInProgress', { title: subSplitTargetTitle }) }}</span>
              </div>
              <TaskSplitPreview
                :tasks="taskSplitStore.splitResult!"
                :disable-actions="previewActionsDisabled"
                :is-optimizing-list="isListOptimizePending && isSessionRunning"
                @update="taskSplitStore.updateSplitTask"
                @remove="taskSplitStore.removeSplitTask"
                @add="taskSplitStore.addSplitTask"
                @optimize-list="handleOptimizeList"
              />
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <!-- 有预览时：输入栏 + 操作按钮 -->
          <template v-if="showPreview">
            <div
              v-if="isSubSplitActive && isSessionRunning"
              class="footer-resplit-hint"
            >
              <span class="resplit-hint-spinner" />
              <span>{{ t('taskSplit.resplitInProgressHint', { title: subSplitTargetTitle }) }}</span>
            </div>
            <div class="footer-input-bar">
              <div class="input-wrapper">
                <textarea
                  ref="instructionInputRef"
                  v-model="userInstruction"
                  class="instruction-input"
                  :disabled="isSessionRunning || isConfirming"
                  :placeholder="t('taskSplit.instructionPlaceholder')"
                  rows="1"
                  @keydown="handleInstructionKeydown"
                  @input="handleInstructionInput"
                  @click="handleInstructionCaretChange"
                  @keyup="handleInstructionCaretChange"
                  @select="handleInstructionCaretChange"
                />
                <div
                  v-if="showMentionSuggestions"
                  class="instruction-mentions"
                >
                  <button
                    v-for="(option, index) in mentionSuggestions"
                    :key="option.index"
                    type="button"
                    class="instruction-mentions__item"
                    :class="{ 'instruction-mentions__item--active': index === selectedMentionOptionIndex }"
                    @mousedown.prevent="applyMentionSuggestion(index)"
                  >
                    <span class="instruction-mentions__badge">@{{ option.index + 1 }}</span>
                    <span class="instruction-mentions__title">{{ option.title || t('taskBoard.emptyNoTasks') }}</span>
                  </button>
                </div>
              </div>
              <button
                class="btn btn-send"
                :disabled="isSessionRunning || isConfirming || !userInstruction.trim()"
                @click="handleUserInstruction"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              </button>
            </div>
            <div class="footer-actions footer-actions--confirm">
              <button
                v-if="hasPendingRefinement"
                class="btn btn-secondary"
                @click="closeDialog"
              >
                {{ t(refinementMode === 'list_optimize' ? 'taskSplit.discardOptimize' : 'taskSplit.discardResplit') }}
              </button>
              <button
                v-if="showStopButton"
                class="btn btn-danger"
                @click="stopSplitTask"
              >
                {{ t('taskSplit.stopTask') }}
              </button>
              <button
                v-if="canRetrySplit"
                class="btn btn-secondary btn-retry"
                @click="retrySplitTask"
              >
                {{ retryActionLabel }}
              </button>
              <button
                v-if="canContinueSplit"
                class="btn btn-secondary btn-continue"
                @click="continueSplitTask"
              >
                {{ t('taskSplit.continueSplit') }}
              </button>
              <button
                class="btn btn-secondary"
                :disabled="isConfirming || isSessionRunning"
                @click="closeDialog"
              >
                {{ t('taskSplit.close') }}
              </button>
              <button
                class="btn btn-secondary"
                :disabled="isSessionRunning"
                @click="restartSplit"
              >
                {{ t('taskSplit.restart') }}
              </button>
              <button
                class="btn btn-primary"
                :disabled="isConfirming || isSessionRunning || (hasPendingRefinement && !canApplyRefinement)"
                @click="confirmSplit"
              >
                {{ primaryActionLabel }}
              </button>
            </div>
          </template>

          <!-- 无预览时：提示 + 操作按钮（保持原有行为） -->
          <template v-else>
            <div class="footer-bar">
              <span
                class="idle-hint"
                :class="{ 'idle-hint--error': canRetrySplit }"
              >
                {{ footerHint }}
              </span>
              <div class="footer-actions">
                <button
                  v-if="canRetrySplit"
                  class="btn btn-secondary btn-retry"
                  @click="retrySplitTask"
                >
                  {{ retryActionLabel }}
                </button>
                <button
                  v-if="canContinueSplit"
                  class="btn btn-secondary btn-continue"
                  @click="continueSplitTask"
                >
                  {{ t('taskSplit.continueSplit') }}
                </button>
                <button
                  v-if="showStopButton"
                  class="btn btn-danger"
                  @click="stopSplitTask"
                >
                  {{ t('taskSplit.stopTask') }}
                </button>
                <button
                  class="btn btn-secondary"
                  @click="closeDialog"
                >
                  {{ t('taskSplit.hide') }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <TaskListOptimizeModal
      v-model:visible="optimizeListModalVisible"
      :task-count="taskSplitStore.splitResult?.length || 0"
      :default-expert-id="taskSplitStore.context?.expertId"
      :default-model-id="taskSplitStore.context?.modelId"
      @confirm="handleOptimizeListConfirm"
    />
  </Teleport>
</template>

<style scoped src="./taskSplitDialog/styles.css"></style>
