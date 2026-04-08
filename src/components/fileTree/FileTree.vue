<script setup lang="ts">
import { NTree } from 'naive-ui'
import { EaButton, EaIcon } from '@/components/common'
import FileTreeContextMenu from './FileTreeContextMenu.vue'
import FileTreeCreateDialog from './FileTreeCreateDialog.vue'
import FileTreeRenameDialog from './FileTreeRenameDialog.vue'
import { useFileTree, type FileTreeEmits, type FileTreeProps } from './useFileTree'

const props = defineProps<FileTreeProps>()
const emit = defineEmits<FileTreeEmits>()

const {
  t,
  loading,
  rootRef,
  treeData,
  expandedKeys,
  contextMenuContext,
  renameDialogVisible,
  renameNode,
  createDialogVisible,
  createTargetNode,
  createEntryType,
  deleteConfirmVisible,
  deleteNode,
  batchDeleteConfirmVisible,
  selectedActionPaths,
  handleExpandChange,
  handleTreeRootContextMenu,
  handleRootClick,
  closeContextMenu,
  handleRename,
  confirmRename,
  handleCreateFile,
  handleCreateFolder,
  confirmCreate,
  handleDelete,
  confirmDelete,
  confirmBatchDelete,
  allowDrop,
  handleTreeDragStart,
  handleTreeDragOver,
  handleTreeDragLeave,
  handleTreeDragEnd,
  handleDrop,
  handleSendToSession,
  renderLabel,
  resolveNodeProps
} = useFileTree(props, emit)
</script>

<template>
  <div
    ref="rootRef"
    class="file-tree"
    tabindex="0"
    @click="handleRootClick"
    @contextmenu="handleTreeRootContextMenu"
  >
    <n-tree
      :data="treeData"
      :expanded-keys="expandedKeys"
      virtual-scroll
      draggable
      :selectable="false"
      block-line
      :allow-drop="allowDrop"
      :render-label="renderLabel"
      :node-props="resolveNodeProps"
      :override-default-node-click-behavior="() => 'none'"
      class="file-tree__n-tree"
      @update:expanded-keys="handleExpandChange"
      @dragstart="handleTreeDragStart"
      @dragover="handleTreeDragOver"
      @dragleave="handleTreeDragLeave"
      @dragend="handleTreeDragEnd"
      @drop="handleDrop"
    />

    <FileTreeContextMenu
      :context="contextMenuContext"
      @create-file="handleCreateFile"
      @create-folder="handleCreateFolder"
      @rename="handleRename"
      @delete="handleDelete"
      @send-to-session="handleSendToSession"
      @close="closeContextMenu"
    />

    <FileTreeCreateDialog
      v-model:visible="createDialogVisible"
      :node="createTargetNode"
      :entry-type="createEntryType"
      @confirm="confirmCreate"
      @cancel="createDialogVisible = false"
    />

    <FileTreeRenameDialog
      v-model:visible="renameDialogVisible"
      :node="renameNode"
      @confirm="confirmRename"
      @cancel="renameDialogVisible = false"
    />

    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="deleteConfirmVisible"
          class="modal-overlay"
          @click="deleteConfirmVisible = false"
        >
          <div
            class="confirm-dialog"
            @click.stop
          >
            <div class="confirm-dialog__content">
              <EaIcon
                name="alert-triangle"
                :size="24"
                class="confirm-dialog__icon"
              />
              <h4 class="confirm-dialog__title">
                {{ t('fileTree.confirmDeleteTitle') }}
              </h4>
              <p class="confirm-dialog__message">
                {{ t('fileTree.confirmDeleteMessage', { name: deleteNode?.label }) }}
              </p>
            </div>
            <div class="confirm-dialog__actions">
              <EaButton
                type="secondary"
                @click="deleteConfirmVisible = false"
              >
                {{ t('common.cancel') }}
              </EaButton>
              <EaButton
                type="primary"
                :loading="loading"
                @click="confirmDelete"
              >
                {{ t('common.confirmDelete') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="batchDeleteConfirmVisible"
          class="modal-overlay"
          @click="batchDeleteConfirmVisible = false"
        >
          <div
            class="confirm-dialog"
            @click.stop
          >
            <div class="confirm-dialog__content">
              <EaIcon
                name="alert-triangle"
                :size="24"
                class="confirm-dialog__icon"
              />
              <h4 class="confirm-dialog__title">
                {{ t('fileTree.confirmBatchDeleteTitle') }}
              </h4>
              <p class="confirm-dialog__message">
                {{ t('fileTree.confirmBatchDeleteMessage', { count: selectedActionPaths.length }) }}
              </p>
            </div>
            <div class="confirm-dialog__actions">
              <EaButton
                type="secondary"
                @click="batchDeleteConfirmVisible = false"
              >
                {{ t('common.cancel') }}
              </EaButton>
              <EaButton
                type="primary"
                :loading="loading"
                @click="confirmBatchDelete"
              >
                {{ t('common.confirmDelete') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped src="./styles.css"></style>
