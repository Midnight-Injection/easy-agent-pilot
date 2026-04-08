<script setup lang="ts">
import { EaIcon } from '@/components/common'
import CompressionConfirmDialog from '@/components/common/CompressionConfirmDialog.vue'
import { ConversationTodoPanel } from '@/components/message'
import type { ConversationComposerProps } from './conversationComposer/useConversationComposerView'
import { useConversationComposerView } from './conversationComposer/useConversationComposerView'
import CdPathDropdown from './CdPathDropdown.vue'
import FileMentionDropdown from './FileMentionDropdown.vue'
import SlashCommandDropdown from './SlashCommandDropdown.vue'

const props = withDefaults(defineProps<ConversationComposerProps>(), {
  sessionId: null,
  workingDirectory: null,
  setWorkingDirectory: undefined,
  defaultFileMentionScope: 'project',
  compact: false,
  showWorkingDirectory: false,
  hideStatusBar: false
})

const emit = defineEmits<{
  focus: []
}>()

const {
  agentDropdownRef,
  agentOptions,
  buildQueuedMessagePreview,
  cancelQueuedMessageEdit,
  cdPathPosition,
  cdPathQuery,
  closeFileMention,
  closeCdPathSuggestions,
  closeSlashCommand,
  composerSendShortcutHint,
  currentAgent,
  currentAgentId,
  currentAgentName,
  currentMemoryPreview,
  currentMemoryReferences,
  currentProjectPath,
  currentWorkingDirectory,
  clearMemoryPreview,
  dismissMemorySuggestion,
  editingQueuedDraftId,
  fileInputRef,
  fileMentionPosition,
  focusInput,
  getModelLabel,
  handleCancelCompress,
  handleCdPathSelect,
  handleConfirmCompress,
  handleCompositionEnd,
  handleCompositionStart,
  handleFileSelect,
  handleImageFileChange,
  handleInput,
  handleKeyDown,
  handleMessageFormSubmit,
  handleOpenCompress,
  handlePaste,
  hasVisibleMemorySuggestions,
  insertMemoryReference,
  handleSlashCommandSelect,
  inputPlaceholder,
  inputText,
  isActiveMemorySuggestion,
  isAgentDropdownOpen,
  isCompressing,
  isDarkTheme,
  isDragOver,
  isMainPanel,
  isMemorySuggestionLoading,
  isMiniPanel,
  isModelDropdownOpen,
  isQueueCollapsed,
  isSending,
  isUploadingImages,
  mentionSearchText,
  mentionStart,
  messageCount,
  modelDropdownRef,
  openImagePicker,
  parsedInputText,
  pendingImages,
  previewMemoryReference,
  previewMemorySuggestion,
  presetModelOptions,
  queuedDraftEditText,
  queuedMessages,
  removeImage,
  removeMemoryReferenceFromDraft,
  removeQueuedMessage,
  renderLayerRef,
  retryMessage,
  retryQueuedMessage,
  rootRef,
  saveQueuedMessageEdit,
  selectedModelId,
  selectAgent,
  selectModel,
  setQueuedDraftEditorRef,
  shouldShowCompressButton,
  shouldShowMemorySuggestionEmptyState,
  shouldShowMemorySuggestionIdleHint,
  shouldShowMemorySuggestions,
  shouldUseRichTextOverlay,
  showCdPathSuggestions,
  showCompressionDialog,
  showFileMention,
  showSlashCommand,
  slashCommandPosition,
  slashCommandQuery,
  slashCommands,
  startQueuedMessageEdit,
  syncScroll,
  t,
  textareaRef,
  toggleAgentDropdown,
  toggleModelDropdown,
  toggleQueueCollapsed,
  tokenUsage,
  visibleMemorySuggestions
} = useConversationComposerView(props)

defineExpose({
  focusInput,
  handleMessageFormSubmit,
  retryMessage,
  openCompressionDialog: handleOpenCompress
})
</script>

<template>
  <div
    ref="rootRef"
    class="conversation-composer"
    :data-drag-text="t('message.dropImages')"
    :class="{
      'conversation-composer--main': isMainPanel,
      'conversation-composer--mini': isMiniPanel,
      'conversation-composer--compact': compact,
      'conversation-composer--drag-over': isDragOver,
      'conversation-composer--dark': isDarkTheme
    }"
  >
    <div
      v-if="hideStatusBar && showWorkingDirectory && currentWorkingDirectory"
      class="conversation-composer__path-row"
    >
      <div
        class="conversation-composer__path"
        :title="currentWorkingDirectory"
      >
        <EaIcon
          name="folder-open"
          :size="12"
        />
        <span>{{ currentWorkingDirectory }}</span>
      </div>
    </div>

    <div
      v-if="!isMainPanel && !hideStatusBar"
      class="conversation-composer__status"
    >
      <div class="conversation-composer__status-left">
        <div
          v-if="queuedMessages.length > 0"
          class="conversation-composer__queue-pill"
        >
          <EaIcon
            name="clock-3"
            :size="12"
          />
          <span>{{ queuedMessages.length }}</span>
        </div>

        <div
          v-if="showWorkingDirectory && currentWorkingDirectory"
          class="conversation-composer__path"
          :title="currentWorkingDirectory"
        >
          <EaIcon
            name="folder-open"
            :size="12"
          />
          <span>{{ currentWorkingDirectory }}</span>
        </div>
      </div>

      <div class="conversation-composer__status-right">
        <button
          v-if="shouldShowCompressButton"
          class="composer-chip composer-chip--compress"
          :disabled="isCompressing || isSending"
          @click="handleOpenCompress"
        >
          <EaIcon
            name="archive"
            :size="12"
          />
          <span>{{ isCompressing ? t('compression.processing') : t('token.compress') }}</span>
        </button>

        <div
          ref="agentDropdownRef"
          class="composer-chip composer-chip--dropdown"
          :class="{ 'composer-chip--open': isAgentDropdownOpen }"
        >
          <button
            class="composer-chip__button"
            @click="toggleAgentDropdown"
          >
            <EaIcon
              :name="currentAgent?.type === 'cli' ? 'terminal' : 'code'"
              :size="12"
            />
            <span>{{ currentAgentName }}</span>
            <EaIcon
              :name="isAgentDropdownOpen ? 'chevron-up' : 'chevron-down'"
              :size="10"
            />
          </button>
          <Transition name="dropdown">
            <div
              v-if="isAgentDropdownOpen"
              class="composer-chip__menu"
            >
              <div
                v-for="option in agentOptions"
                :key="option.value"
                class="composer-chip__option"
                :class="{ 'composer-chip__option--selected': option.value === currentAgentId }"
                @click="selectAgent(option.value)"
              >
                <EaIcon
                  :name="option.type === 'cli' ? 'terminal' : 'code'"
                  :size="12"
                />
                <span>{{ option.label }}</span>
                <span class="composer-chip__tag">{{ option.provider ? option.provider.toUpperCase() + ' CLI' : option.type === 'cli' ? 'CLI' : 'SDK' }}</span>
              </div>
            </div>
          </Transition>
        </div>

        <div
          v-if="currentAgent"
          ref="modelDropdownRef"
          class="composer-chip composer-chip--dropdown"
          :class="{ 'composer-chip--open': isModelDropdownOpen }"
        >
          <button
            class="composer-chip__button"
            @click="toggleModelDropdown"
          >
            <EaIcon
              name="cpu"
              :size="12"
            />
            <span>{{ getModelLabel(selectedModelId) }}</span>
            <EaIcon
              :name="isModelDropdownOpen ? 'chevron-up' : 'chevron-down'"
              :size="10"
            />
          </button>
          <Transition name="dropdown">
            <div
              v-if="isModelDropdownOpen"
              class="composer-chip__menu"
            >
              <div
                v-for="model in presetModelOptions"
                :key="model.value"
                class="composer-chip__option"
                :class="{ 'composer-chip__option--selected': model.value === selectedModelId }"
                @click="selectModel(model.value)"
              >
                {{ model.label }}
              </div>
            </div>
          </Transition>
        </div>

        <button
          class="composer-chip composer-chip--image"
          :disabled="isUploadingImages"
          @click="openImagePicker"
        >
          <EaIcon
            name="image-up"
            :size="12"
          />
          <span>{{ isUploadingImages ? t('message.uploadingImages') : t('message.selectImages') }}</span>
        </button>
      </div>
    </div>

    <div class="conversation-composer__panel">
      <ConversationTodoPanel
        v-if="sessionId"
        :session-id="sessionId"
        :default-collapsed="true"
      />

      <div
        v-if="isMainPanel && pendingImages.length > 0"
        class="conversation-composer__attachments conversation-composer__attachments--main"
      >
        <div
          v-for="image in pendingImages"
          :key="image.id"
          class="conversation-composer__attachment"
        >
          <img
            :src="image.previewUrl"
            :alt="image.name"
            class="conversation-composer__attachment-image"
          >
          <button
            class="conversation-composer__attachment-remove"
            @click="removeImage(image.id)"
          >
            <EaIcon
              name="x"
              :size="12"
            />
          </button>
        </div>
      </div>

      <div
        v-if="isMainPanel"
        class="conversation-composer__main-header"
      >
        <div class="conversation-composer__main-header-left">
          <div
            ref="agentDropdownRef"
            class="composer-chip composer-chip--dropdown"
            :class="{
              'composer-chip--main': isMainPanel,
              'composer-chip--open': isAgentDropdownOpen
            }"
          >
            <button
              class="composer-chip__button"
              @click="toggleAgentDropdown"
            >
              <EaIcon
                :name="currentAgent?.type === 'cli' ? 'terminal' : 'code'"
                :size="11"
              />
              <span>{{ currentAgentName }}</span>
              <EaIcon
                :name="isAgentDropdownOpen ? 'chevron-up' : 'chevron-down'"
                :size="9"
              />
            </button>
            <Transition name="dropdown">
              <div
                v-if="isAgentDropdownOpen"
                class="composer-chip__menu"
              >
                <div
                  v-for="option in agentOptions"
                  :key="option.value"
                  class="composer-chip__option"
                  :class="{ 'composer-chip__option--selected': option.value === currentAgentId }"
                  @click="selectAgent(option.value)"
                >
                  <EaIcon
                    :name="option.type === 'cli' ? 'terminal' : 'code'"
                    :size="12"
                  />
                  <span>{{ option.label }}</span>
                  <span class="composer-chip__tag">{{ option.provider ? option.provider.toUpperCase() + ' CLI' : option.type === 'cli' ? 'CLI' : 'SDK' }}</span>
                </div>
              </div>
            </Transition>
          </div>

          <!-- 模型选择器，移到智能体旁边 -->
          <div
            v-if="currentAgent"
            ref="modelDropdownRef"
            class="composer-chip composer-chip--dropdown"
            :class="{
              'composer-chip--main': isMainPanel,
              'composer-chip--open': isModelDropdownOpen
            }"
          >
            <button
              class="composer-chip__button"
              @click="toggleModelDropdown"
            >
              <EaIcon
                name="cpu"
                :size="11"
              />
              <span>{{ getModelLabel(selectedModelId) }}</span>
              <EaIcon
                :name="isModelDropdownOpen ? 'chevron-up' : 'chevron-down'"
                :size="9"
              />
            </button>
            <Transition name="dropdown">
              <div
                v-if="isModelDropdownOpen"
                class="composer-chip__menu"
              >
                <div
                  v-for="model in presetModelOptions"
                  :key="model.value"
                  class="composer-chip__option"
                  :class="{ 'composer-chip__option--selected': model.value === selectedModelId }"
                  @click="selectModel(model.value)"
                >
                  {{ model.label }}
                </div>
              </div>
            </Transition>
          </div>

          <!-- 图片按钮移到顶部 -->
          <button
            class="composer-chip composer-chip--image"
            :class="{ 'composer-chip--main': isMainPanel }"
            :disabled="isUploadingImages"
            @click="openImagePicker"
          >
            <EaIcon
              name="image-up"
              :size="12"
            />
            <span>{{ isUploadingImages ? t('message.uploadingImages') : t('message.selectImages') }}</span>
          </button>

          <div
            v-if="queuedMessages.length > 0"
            class="conversation-composer__queue-pill conversation-composer__queue-pill--main"
          >
            <EaIcon
              name="clock-3"
              :size="12"
            />
            <span>{{ t('message.queueCount', { count: queuedMessages.length }) }}</span>
          </div>
        </div>
      </div>

      <input
        ref="fileInputRef"
        type="file"
        class="conversation-composer__file-input"
        accept="image/*"
        multiple
        @change="handleImageFileChange"
      >

      <div
        v-if="!isMainPanel && pendingImages.length > 0"
        class="conversation-composer__attachments"
      >
        <div
          v-for="image in pendingImages"
          :key="image.id"
          class="conversation-composer__attachment"
        >
          <img
            :src="image.previewUrl"
            :alt="image.name"
            class="conversation-composer__attachment-image"
          >
          <button
            class="conversation-composer__attachment-remove"
            @click="removeImage(image.id)"
          >
            <EaIcon
              name="x"
              :size="12"
            />
          </button>
        </div>
      </div>

      <div
        v-if="queuedMessages.length > 0"
        class="conversation-composer__queue"
      >
        <button
          v-if="isMainPanel"
          type="button"
          class="conversation-composer__queue-head"
          :aria-expanded="!isQueueCollapsed"
          @click="toggleQueueCollapsed"
        >
          <span class="conversation-composer__queue-head-title">
            <EaIcon
              name="clock-3"
              :size="13"
            />
            <span>{{ t('message.queueCount', { count: queuedMessages.length }) }}</span>
          </span>
          <EaIcon
            :name="isQueueCollapsed ? 'chevron-down' : 'chevron-up'"
            :size="14"
          />
        </button>

        <div
          v-for="(draft, index) in queuedMessages"
          v-show="!isMainPanel || !isQueueCollapsed"
          :key="draft.id"
          class="conversation-composer__queue-item"
          :class="{ 'conversation-composer__queue-item--editing': editingQueuedDraftId === draft.id }"
        >
          <div class="conversation-composer__queue-index">
            {{ index + 1 }}
          </div>
          <div class="conversation-composer__queue-body">
            <div class="conversation-composer__queue-top">
              <span>{{ draft.status === 'failed' ? t('message.pendingFailed') : t('message.pendingLabel') }}</span>
              <span v-if="draft.attachments.length > 0">{{ t('message.queueImages', { count: draft.attachments.length }) }}</span>
            </div>
            <div
              class="conversation-composer__queue-preview"
              :class="{ 'conversation-composer__queue-preview--editing': editingQueuedDraftId === draft.id }"
            >
              <textarea
                v-if="editingQueuedDraftId === draft.id"
                :ref="(element) => setQueuedDraftEditorRef(draft.id, element)"
                v-model="queuedDraftEditText"
                class="conversation-composer__queue-editor"
                rows="4"
                placeholder="编辑待发送内容..."
                @keydown.stop
              />
              <template v-else>
                {{ buildQueuedMessagePreview(draft) || t('message.pendingEmpty') }}
              </template>
            </div>
            <div
              v-if="draft.status === 'failed' && draft.errorMessage"
              class="conversation-composer__queue-error"
            >
              {{ draft.errorMessage }}
            </div>
          </div>
          <div class="conversation-composer__queue-actions">
            <button
              v-if="editingQueuedDraftId !== draft.id"
              class="conversation-composer__queue-action"
              @click="startQueuedMessageEdit(draft.id, draft.displayContent || draft.content)"
            >
              <EaIcon
                name="pencil"
                :size="12"
              />
            </button>
            <button
              v-else
              class="conversation-composer__queue-action"
              @click="saveQueuedMessageEdit(draft.id)"
            >
              <EaIcon
                name="check"
                :size="12"
              />
            </button>
            <button
              v-if="editingQueuedDraftId === draft.id"
              class="conversation-composer__queue-action"
              @click="cancelQueuedMessageEdit"
            >
              <EaIcon
                name="x"
                :size="12"
              />
            </button>
            <button
              v-else-if="draft.status === 'failed'"
              class="conversation-composer__queue-action"
              @click="retryQueuedMessage(draft.id)"
            >
              <EaIcon
                name="refresh-cw"
                :size="12"
              />
            </button>
            <button
              class="conversation-composer__queue-action"
              @click="removeQueuedMessage(draft.id)"
            >
              <EaIcon
                name="x"
                :size="12"
              />
            </button>
          </div>
        </div>
      </div>

      <div
        v-if="isMainPanel && currentMemoryReferences.length > 0"
        class="conversation-composer__memory-tray"
      >
        <div class="conversation-composer__memory-tray-label">
          {{ t('message.memoryReferencesTitle') }}
        </div>
        <div class="conversation-composer__memory-chips">
          <button
            v-for="reference in currentMemoryReferences"
            :key="`${reference.sourceType}:${reference.sourceId}`"
            class="conversation-composer__memory-chip"
            type="button"
            :title="reference.fullContent"
            @mouseenter="previewMemoryReference(reference)"
            @mouseleave="clearMemoryPreview"
            @focus="previewMemoryReference(reference)"
            @blur="clearMemoryPreview"
            @click="removeMemoryReferenceFromDraft(reference)"
          >
            <span class="conversation-composer__memory-chip-type">
              {{ reference.sourceType === 'library_chunk' ? t('message.memorySourceLibrary') : t('message.memorySourceRaw') }}
            </span>
            <span class="conversation-composer__memory-chip-text">{{ reference.title }}</span>
            <EaIcon
              name="x"
              :size="12"
            />
          </button>
        </div>
      </div>

      <div
        v-if="isMainPanel && currentMemoryPreview && !shouldShowMemorySuggestions"
        class="conversation-composer__memory-preview"
        :class="{
          'conversation-composer__memory-preview--library': currentMemoryPreview.sourceType === 'library_chunk',
          'conversation-composer__memory-preview--raw': currentMemoryPreview.sourceType === 'raw_record'
        }"
      >
        <div class="conversation-composer__memory-preview-header">
          <span class="conversation-composer__memory-preview-label">
            {{ t('message.memoryPreviewTitle') }}
          </span>
          <span class="conversation-composer__memory-preview-source">
            {{ currentMemoryPreview.sourceLabel }}
          </span>
        </div>
        <div class="conversation-composer__memory-preview-name">
          {{ currentMemoryPreview.title }}
        </div>
        <pre class="conversation-composer__memory-preview-content">{{ currentMemoryPreview.fullContent }}</pre>
      </div>

      <div class="conversation-composer__editor-stack">
        <div
          v-if="isMainPanel && shouldShowMemorySuggestions"
          class="conversation-composer__memory-panel conversation-composer__memory-panel--floating"
        >
          <div class="conversation-composer__memory-panel-header">
            <div>
              <div class="conversation-composer__memory-eyebrow">
                {{ t('message.memorySuggestionEyebrow') }}
              </div>
              <div class="conversation-composer__memory-title">
                {{ hasVisibleMemorySuggestions ? t('message.memorySuggestionTitle') : t('message.memorySearchingActive') }}
              </div>
              <div
                v-if="hasVisibleMemorySuggestions"
                class="conversation-composer__memory-keyboard-hint"
              >
                {{ t('message.memoryKeyboardHint') }}
              </div>
            </div>
            <div
              v-if="isMemorySuggestionLoading"
              class="conversation-composer__memory-loading"
            >
              <span class="conversation-composer__memory-spinner" />
              <span>{{ t('message.memorySearchingActive') }}</span>
            </div>
          </div>

          <div
            v-if="currentMemoryPreview"
            class="conversation-composer__memory-preview"
            :class="{
              'conversation-composer__memory-preview--library': currentMemoryPreview.sourceType === 'library_chunk',
              'conversation-composer__memory-preview--raw': currentMemoryPreview.sourceType === 'raw_record'
            }"
          >
            <div class="conversation-composer__memory-preview-header">
              <span class="conversation-composer__memory-preview-label">
                {{ t('message.memoryPreviewTitle') }}
              </span>
              <span class="conversation-composer__memory-preview-source">
                {{ currentMemoryPreview.sourceLabel }}
              </span>
            </div>
            <div class="conversation-composer__memory-preview-name">
              {{ currentMemoryPreview.title }}
            </div>
            <pre class="conversation-composer__memory-preview-content">{{ currentMemoryPreview.fullContent }}</pre>
          </div>

          <div
            v-if="shouldShowMemorySuggestionEmptyState"
            class="conversation-composer__memory-empty"
          >
            <div class="conversation-composer__memory-empty-title">
              {{ t('message.memoryNoMatches') }}
            </div>
            <div class="conversation-composer__memory-empty-hint">
              {{ t('message.memoryKeepTypingHint') }}
            </div>
          </div>

          <div
            v-else-if="shouldShowMemorySuggestionIdleHint"
            class="conversation-composer__memory-empty conversation-composer__memory-empty--subtle"
          >
            <div class="conversation-composer__memory-empty-hint">
              {{ t('message.memorySearchSettling') }}
            </div>
          </div>

          <div
            v-if="hasVisibleMemorySuggestions && visibleMemorySuggestions.librarySuggestions.length > 0"
            class="conversation-composer__memory-group"
          >
            <div class="conversation-composer__memory-group-title">
              {{ t('message.memorySourceLibrary') }}
            </div>
            <div class="conversation-composer__memory-list">
              <article
                v-for="suggestion in visibleMemorySuggestions.librarySuggestions"
                :key="`${suggestion.sourceType}:${suggestion.sourceId}`"
                class="conversation-composer__memory-card conversation-composer__memory-card--library"
                :class="{
                  'conversation-composer__memory-card--active': isActiveMemorySuggestion(suggestion)
                }"
                role="option"
                :aria-selected="isActiveMemorySuggestion(suggestion)"
                :title="suggestion.fullContent"
                @mouseenter="previewMemorySuggestion(suggestion)"
                @mouseleave="clearMemoryPreview"
              >
                <div class="conversation-composer__memory-card-body">
                  <div class="conversation-composer__memory-card-top">
                    <span class="conversation-composer__memory-badge">
                      {{ t('message.memorySourceLibrary') }}
                    </span>
                    <span class="conversation-composer__memory-card-title">{{ suggestion.title }}</span>
                  </div>
                  <p class="conversation-composer__memory-card-snippet">
                    {{ suggestion.snippet || suggestion.fullContent }}
                  </p>
                </div>
                <div class="conversation-composer__memory-card-actions">
                  <button
                    class="conversation-composer__memory-action conversation-composer__memory-action--ghost"
                    type="button"
                    @click="dismissMemorySuggestion(suggestion)"
                  >
                    {{ t('message.memoryDismiss') }}
                  </button>
                  <button
                    class="conversation-composer__memory-action conversation-composer__memory-action--primary"
                    type="button"
                    @click="insertMemoryReference(suggestion)"
                  >
                    {{ t('message.memoryInsert') }}
                  </button>
                </div>
              </article>
            </div>
          </div>

          <div
            v-if="hasVisibleMemorySuggestions && visibleMemorySuggestions.rawSuggestions.length > 0"
            class="conversation-composer__memory-group"
          >
            <div class="conversation-composer__memory-group-title">
              {{ t('message.memorySourceRaw') }}
            </div>
            <div class="conversation-composer__memory-list">
              <article
                v-for="suggestion in visibleMemorySuggestions.rawSuggestions"
                :key="`${suggestion.sourceType}:${suggestion.sourceId}`"
                class="conversation-composer__memory-card conversation-composer__memory-card--raw"
                :class="{
                  'conversation-composer__memory-card--active': isActiveMemorySuggestion(suggestion)
                }"
                role="option"
                :aria-selected="isActiveMemorySuggestion(suggestion)"
                :title="suggestion.fullContent"
                @mouseenter="previewMemorySuggestion(suggestion)"
                @mouseleave="clearMemoryPreview"
              >
                <div class="conversation-composer__memory-card-body">
                  <div class="conversation-composer__memory-card-top">
                    <span class="conversation-composer__memory-badge conversation-composer__memory-badge--raw">
                      {{ t('message.memorySourceRaw') }}
                    </span>
                    <span class="conversation-composer__memory-card-title">{{ suggestion.title }}</span>
                  </div>
                  <p class="conversation-composer__memory-card-snippet">
                    {{ suggestion.snippet || suggestion.fullContent }}
                  </p>
                </div>
                <div class="conversation-composer__memory-card-actions">
                  <button
                    class="conversation-composer__memory-action conversation-composer__memory-action--ghost"
                    type="button"
                    @click="dismissMemorySuggestion(suggestion)"
                  >
                    {{ t('message.memoryDismiss') }}
                  </button>
                  <button
                    class="conversation-composer__memory-action conversation-composer__memory-action--primary"
                    type="button"
                    @click="insertMemoryReference(suggestion)"
                  >
                    {{ t('message.memoryInsert') }}
                  </button>
                </div>
              </article>
            </div>
          </div>
        </div>

        <div
          class="conversation-composer__editor-shell"
          @contextmenu.prevent
        >
          <div
            ref="renderLayerRef"
            class="conversation-composer__render"
            :class="{
              'conversation-composer__render--hidden': !shouldUseRichTextOverlay
            }"
          >
            <template v-if="parsedInputText.length > 0">
              <template
                v-for="(segment, index) in parsedInputText"
                :key="index"
              >
                <span
                  v-if="segment.type === 'text'"
                  class="conversation-composer__text"
                >{{ segment.content }}</span>
                <span
                  v-else-if="segment.type === 'file'"
                  class="conversation-composer__file-tag"
                  :title="segment.titleContent"
                >{{ segment.displayContent || segment.content }}</span>
                <span
                  v-else-if="segment.type === 'memory'"
                  class="conversation-composer__memory-tag"
                  :title="segment.titleContent"
                >{{ segment.displayContent || segment.content }}</span>
                <span
                  v-else
                  class="conversation-composer__slash-tag"
                >{{ segment.content }}</span>
              </template>
            </template>
          </div>

          <div
            v-if="isMainPanel && !inputText"
            class="conversation-composer__ghost-hints"
          >
            <span class="conversation-composer__ghost-hint-pill">
              <EaIcon
                name="image-up"
                :size="11"
              />
              <span>{{ t('message.ghostHintImages') }}</span>
            </span>
            <span class="conversation-composer__ghost-hint-pill">
              <EaIcon
                name="at-sign"
                :size="11"
              />
              <span>{{ t('message.ghostHintFiles') }}</span>
            </span>
            <span class="conversation-composer__ghost-hint-pill">
              <EaIcon
                name="corner-down-left"
                :size="11"
              />
              <span>{{ t('message.ghostHintSend', { shortcut: composerSendShortcutHint }) }}</span>
            </span>
          </div>

          <textarea
            ref="textareaRef"
            v-model="inputText"
            class="conversation-composer__textarea"
            :class="{
              'conversation-composer__textarea--overlay': shouldUseRichTextOverlay
            }"
            rows="4"
            :disabled="!sessionId"
            :placeholder="shouldUseRichTextOverlay ? '' : (inputPlaceholder || t('message.inputPlaceholder', { shortcut: t('message.shortcutEnter') }))"
            @compositionstart="handleCompositionStart"
            @compositionend="handleCompositionEnd"
            @input="handleInput"
            @keydown="handleKeyDown"
            @paste="handlePaste"
            @scroll="syncScroll"
            @focus="emit('focus')"
          />
        </div>
      </div>
    </div>

    <CompressionConfirmDialog
      v-model:visible="showCompressionDialog"
      :token-usage="tokenUsage"
      :message-count="messageCount"
      :loading="isCompressing"
      @confirm="handleConfirmCompress"
      @cancel="handleCancelCompress"
    />

    <FileMentionDropdown
      :visible="showFileMention"
      :position="fileMentionPosition"
      :search-text="mentionSearchText"
      :mention-start="mentionStart"
      :project-path="workingDirectory || currentProjectPath || undefined"
      :default-scope="defaultFileMentionScope"
      @select="handleFileSelect"
      @close="closeFileMention"
    />

    <SlashCommandDropdown
      :visible="showSlashCommand"
      :position="slashCommandPosition"
      :query="slashCommandQuery"
      :commands="slashCommands"
      @select="handleSlashCommandSelect"
      @close="closeSlashCommand"
    />

    <CdPathDropdown
      :visible="showCdPathSuggestions"
      :position="cdPathPosition"
      :query="cdPathQuery"
      :current-directory="currentWorkingDirectory"
      @select="handleCdPathSelect"
      @close="closeCdPathSuggestions"
    />
  </div>
</template>

<style scoped src="./conversationComposer/styles.css"></style>
