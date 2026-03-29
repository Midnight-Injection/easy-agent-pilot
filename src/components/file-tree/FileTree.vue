<script setup lang="ts">
/**
 * 文件树核心组件。
 * 负责懒加载、右键菜单、新建/重命名/删除、Shift 范围选择、多文件拖拽移动，以及把文件引用发送到会话输入框。
 */

import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NTree, type TreeOption } from 'naive-ui'
import { invoke } from '@tauri-apps/api/core'
import type { UnwatchFn } from '@tauri-apps/plugin-fs'
import { EaButton, EaIcon } from '@/components/common'
import type { FileTreeNode } from '@/stores/project'
import { useSessionFileReference } from '@/composables'
import { createComposerFileMention } from '@/utils/composerFileMention'
import { resolveFileIcon } from '@/utils/fileIcon'
import { startFsWatcher } from '@/utils/fsWatcher'
import { useFileOperations } from './composables/useFileOperations'
import FileTreeContextMenu from './FileTreeContextMenu.vue'
import FileTreeCreateDialog from './FileTreeCreateDialog.vue'
import FileTreeRenameDialog from './FileTreeRenameDialog.vue'
import type { ContextMenuContext, CreateEntryType, FileTreeNodeData } from './types'

const DRAG_AUTO_EXPAND_DELAY_MS = 420

const { t } = useI18n()
const { createEntry, renameFile, deleteFile, batchDeleteFiles, moveFile, loading } = useFileOperations()
const { sendFileReferencesToSession } = useSessionFileReference()

interface Props {
  projectId: string
  projectPath: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  fileSelect: [path: string]
}>()

const rootRef = ref<HTMLElement | null>(null)
const treeData = ref<TreeOption[]>([])
const expandedKeys = ref<string[]>([])
const selectedPaths = ref<string[]>([])
const activePath = ref<string | null>(null)
const anchorPath = ref<string | null>(null)
const contextMenuContext = ref<ContextMenuContext | null>(null)
const renameDialogVisible = ref(false)
const renameNode = ref<FileTreeNodeData | null>(null)
const createDialogVisible = ref(false)
const createTargetNode = ref<FileTreeNodeData | null>(null)
const createEntryType = ref<CreateEntryType>('file')
const deleteConfirmVisible = ref(false)
const deleteNode = ref<FileTreeNodeData | null>(null)
const batchDeleteConfirmVisible = ref(false)
const isLoading = ref(false)
const pendingReload = ref(false)
const unwatchFileTree = ref<UnwatchFn | null>(null)
const reloadTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const directoryChildrenCache = ref<Map<string, FileTreeNode[]>>(new Map())
const dragPaths = ref<string[]>([])
const dragOverKey = ref<string | null>(null)
const dragExpandTargetKey = ref<string | null>(null)
const dragExpandTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const rootContextNode = computed<FileTreeNodeData>(() => ({
  key: props.projectPath,
  label: extractProjectLabel(props.projectPath),
  nodeType: 'directory',
  projectId: props.projectId,
  isLeaf: false,
  isRoot: true
}))

const selectedActionPaths = computed(() => dedupePaths(selectedPaths.value))
const selectedPathSet = computed(() => new Set(selectedPaths.value))

function extractProjectLabel(projectPath: string): string {
  const normalized = projectPath.replace(/[\\/]+$/, '').replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] || normalized || projectPath
}

function normalizeComparablePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function isAncestorPath(ancestor: string, candidate: string): boolean {
  const normalizedAncestor = normalizeComparablePath(ancestor)
  const normalizedCandidate = normalizeComparablePath(candidate)
  return normalizedCandidate.startsWith(`${normalizedAncestor}/`)
}

function dedupePaths(paths: string[]): string[] {
  const uniquePaths = Array.from(new Set(paths))
    .filter(Boolean)
    .sort((left, right) => normalizeComparablePath(left).length - normalizeComparablePath(right).length)

  return uniquePaths.filter((path, index) =>
    !uniquePaths.slice(0, index).some(existing => isAncestorPath(existing, path))
  )
}

function buildNodeData(node: TreeOption, extra: Partial<FileTreeNodeData> = {}): FileTreeNodeData {
  return {
    key: node.key as string,
    label: node.label as string,
    nodeType: (node as { nodeType?: 'file' | 'directory' }).nodeType ?? 'file',
    extension: (node as { extension?: string }).extension,
    projectId: props.projectId,
    isLeaf: Boolean(node.isLeaf),
    ...extra
  }
}

function resolveParentPath(node: FileTreeNodeData): string {
  if (node.isRoot || node.nodeType === 'directory') {
    return node.key
  }

  const normalized = node.key.replace(/[\\/]+$/, '')
  const separatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : props.projectPath
}

function resolveActionPaths(node: FileTreeNodeData): string[] {
  if (selectedActionPaths.value.length > 1 && selectedPathSet.value.has(node.key)) {
    return selectedActionPaths.value
  }

  return dedupePaths([node.key])
}

function clearDragState(): void {
  dragPaths.value = []
  dragOverKey.value = null
  dragExpandTargetKey.value = null

  if (dragExpandTimer.value) {
    clearTimeout(dragExpandTimer.value)
    dragExpandTimer.value = null
  }
}

function clearSelectionState(): void {
  selectedPaths.value = []
  activePath.value = null
  anchorPath.value = null
}

function setSingleSelection(path: string): void {
  selectedPaths.value = [path]
  activePath.value = path
  anchorPath.value = path
}

function flattenVisiblePaths(nodes: TreeOption[]): string[] {
  const expandedSet = new Set(expandedKeys.value)
  const visiblePaths: string[] = []

  const walk = (items: TreeOption[]) => {
    items.forEach((item) => {
      const path = String(item.key)
      visiblePaths.push(path)

      if (item.children?.length && expandedSet.has(path)) {
        walk(item.children as TreeOption[])
      }
    })
  }

  walk(nodes)
  return visiblePaths
}

function applyRangeSelection(targetPath: string): void {
  const currentAnchor = anchorPath.value
  if (!currentAnchor) {
    setSingleSelection(targetPath)
    return
  }

  const visiblePaths = flattenVisiblePaths(treeData.value)
  const anchorIndex = visiblePaths.indexOf(currentAnchor)
  const targetIndex = visiblePaths.indexOf(targetPath)

  if (anchorIndex === -1 || targetIndex === -1) {
    setSingleSelection(targetPath)
    return
  }

  const [start, end] = anchorIndex <= targetIndex
    ? [anchorIndex, targetIndex]
    : [targetIndex, anchorIndex]

  selectedPaths.value = visiblePaths.slice(start, end + 1)
  activePath.value = targetPath
}

function openFileIfNeeded(node: FileTreeNodeData): void {
  if (node.nodeType !== 'file') {
    return
  }

  emit('fileSelect', node.key)
}

async function loadTreeData() {
  if (isLoading.value) {
    pendingReload.value = true
    return
  }

  isLoading.value = true
  try {
    const result = await invoke<FileTreeNode[]>('list_project_files', {
      projectPath: props.projectPath
    })
    treeData.value = convertToTreeOptions(result)
    await restoreExpandedDirectories()

    selectedPaths.value = selectedPaths.value.filter(path => !!findTreeNodeByKey(treeData.value, path))

    if (activePath.value && !findTreeNodeByKey(treeData.value, activePath.value)) {
      activePath.value = null
    }

    if (anchorPath.value && !findTreeNodeByKey(treeData.value, anchorPath.value)) {
      anchorPath.value = null
    }
  } catch (error) {
    console.error('Failed to load file tree:', error)
  } finally {
    isLoading.value = false

    if (pendingReload.value) {
      pendingReload.value = false
      await loadTreeData()
    }
  }
}

function getPathDepth(path: string): number {
  return path.split(/[\\/]/).filter(Boolean).length
}

async function restoreExpandedDirectories() {
  if (expandedKeys.value.length === 0) {
    return
  }

  const sortedExpandedKeys = [...expandedKeys.value].sort((left, right) => getPathDepth(left) - getPathDepth(right))

  for (const key of sortedExpandedKeys) {
    const node = findTreeNodeByKey(treeData.value, key)
    if (!node || (node.nodeType !== 'directory' && node.isLeaf !== false)) {
      continue
    }

    try {
      await loadChildrenForNode(node)
    } catch (error) {
      console.error('Failed to restore expanded directory:', error)
    }
  }
}

function scheduleTreeReload() {
  if (reloadTimer.value) {
    clearTimeout(reloadTimer.value)
  }

  reloadTimer.value = setTimeout(() => {
    reloadTimer.value = null
    void loadTreeData()
  }, 250)
}

function cloneTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.map(node => ({
    ...node,
    children: node.children ? cloneTreeNodes(node.children) : undefined
  }))
}

function stopFileWatcher() {
  if (reloadTimer.value) {
    clearTimeout(reloadTimer.value)
    reloadTimer.value = null
  }

  if (unwatchFileTree.value) {
    unwatchFileTree.value()
    unwatchFileTree.value = null
  }
}

async function startFileWatcher(projectPath: string) {
  stopFileWatcher()

  try {
    unwatchFileTree.value = await startFsWatcher(
      projectPath,
      () => {
        scheduleTreeReload()
      },
      {
        recursive: true,
        delayMs: 300
      }
    )
  } catch (error) {
    console.error('Failed to watch project directory:', error)
  }
}

function convertToTreeOptions(nodes: FileTreeNode[]): TreeOption[] {
  return nodes.map(node => {
    const isFile = node.nodeType === 'file'
    const option: TreeOption = {
      key: node.path,
      label: node.name,
      isLeaf: isFile,
      nodeType: node.nodeType,
      extension: node.extension,
      projectId: props.projectId
    }

    if (!isFile) {
      const cachedChildren = directoryChildrenCache.value.get(node.path)
      option.children = cachedChildren ? convertToTreeOptions(cachedChildren) : []
    }

    return option
  })
}

function findTreeNodeByKey(nodes: TreeOption[], key: string): (TreeOption & { nodeType?: string }) | null {
  for (const node of nodes) {
    if (String(node.key) === key) {
      return node as TreeOption & { nodeType?: string }
    }
    if (node.children?.length) {
      const matched = findTreeNodeByKey(node.children as TreeOption[], key)
      if (matched) {
        return matched
      }
    }
  }

  return null
}

async function loadChildrenForNode(node: TreeOption, forceRefresh = true): Promise<void> {
  const nodePath = node.key as string
  const cachedChildren = directoryChildrenCache.value.get(nodePath)
  const children = !forceRefresh && cachedChildren
    ? cachedChildren
    : await invoke<FileTreeNode[]>('load_directory_children', { dirPath: nodePath })

  if (forceRefresh || !cachedChildren) {
    const nextCache = new Map(directoryChildrenCache.value)
    nextCache.set(nodePath, cloneTreeNodes(children))
    directoryChildrenCache.value = nextCache
  }

  node.children = children.map(child => {
    const isFile = child.nodeType === 'file'
    const option: TreeOption = {
      key: child.path,
      label: child.name,
      isLeaf: isFile,
      nodeType: child.nodeType,
      extension: child.extension,
      projectId: props.projectId
    }
    if (!isFile) {
      option.children = []
    }
    return option
  })
}

async function ensureExpanded(path: string): Promise<void> {
  if (expandedKeys.value.includes(path)) {
    return
  }

  expandedKeys.value = [...expandedKeys.value, path]
  const node = findTreeNodeByKey(treeData.value, path)
  if (!node || node.nodeType !== 'directory') {
    return
  }

  try {
    await loadChildrenForNode(node)
  } catch (error) {
    console.error('Failed to load node children on auto expand:', error)
  }
}

async function handleExpandChange(keys: string[]) {
  const previousKeys = new Set(expandedKeys.value)
  expandedKeys.value = keys

  const justExpandedKeys = keys.filter(key => !previousKeys.has(key))
  if (justExpandedKeys.length === 0) {
    return
  }

  const targetNodes = justExpandedKeys
    .map(key => findTreeNodeByKey(treeData.value, key))
    .filter((node): node is TreeOption & { nodeType?: string } => !!node)
    .filter(node => node.nodeType === 'directory' || node.isLeaf === false)

  await Promise.all(targetNodes.map(async node => {
    try {
      await loadChildrenForNode(node)
    } catch (error) {
      console.error('Failed to refresh node children on expand:', error)
    }
  }))
}

function handleNodeClick(event: MouseEvent, node: TreeOption) {
  rootRef.value?.focus()
  const nodeData = buildNodeData(node)

  if (event.shiftKey) {
    applyRangeSelection(nodeData.key)
  } else {
    if (selectedPaths.value.length === 1 && activePath.value === nodeData.key) {
      clearSelectionState()
      return
    }

    setSingleSelection(nodeData.key)
  }

  openFileIfNeeded(nodeData)
}

function handleContextMenu(event: MouseEvent, node: TreeOption) {
  event.preventDefault()
  event.stopPropagation()
  rootRef.value?.focus()

  const nodePath = String(node.key)
  if (!selectedPathSet.value.has(nodePath)) {
    setSingleSelection(nodePath)
  } else {
    activePath.value = nodePath
  }

  contextMenuContext.value = {
    node: buildNodeData(node),
    position: { x: event.clientX, y: event.clientY }
  }
}

function handleTreeRootContextMenu(event: MouseEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('.n-tree-node')) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  rootRef.value?.focus()
  contextMenuContext.value = {
    node: rootContextNode.value,
    position: { x: event.clientX, y: event.clientY }
  }
}

function handleRootClick(event: MouseEvent) {
  rootRef.value?.focus()

  const target = event.target
  if (target instanceof Element && target.closest('.n-tree-node')) {
    return
  }

  clearSelectionState()
  closeContextMenu()
}

function closeContextMenu() {
  contextMenuContext.value = null
}

function handleRename(node: FileTreeNodeData) {
  renameNode.value = node
  renameDialogVisible.value = true
}

async function confirmRename(oldPath: string, newName: string) {
  const result = await renameFile(oldPath, newName)
  if (result?.success) {
    await loadTreeData()
  }
}

function handleCreateFile(node: FileTreeNodeData) {
  createTargetNode.value = node
  createEntryType.value = 'file'
  createDialogVisible.value = true
}

function handleCreateFolder(node: FileTreeNodeData) {
  createTargetNode.value = node
  createEntryType.value = 'directory'
  createDialogVisible.value = true
}

async function confirmCreate(node: FileTreeNodeData, name: string, entryType: CreateEntryType) {
  const parentPath = resolveParentPath(node)
  const result = await createEntry({
    parentPath,
    name,
    entryType
  })

  if (result?.success) {
    if (!node.isRoot && node.nodeType === 'directory') {
      await ensureExpanded(node.key)
    }
    await loadTreeData()
  }
}

function handleDelete(node: FileTreeNodeData) {
  const actionPaths = resolveActionPaths(node)
  if (actionPaths.length > 1) {
    batchDeleteConfirmVisible.value = true
    return
  }

  deleteNode.value = node
  deleteConfirmVisible.value = true
}

function handleDeleteSelection() {
  const actionPaths = selectedActionPaths.value
  if (actionPaths.length === 0) {
    return
  }

  if (actionPaths.length > 1) {
    batchDeleteConfirmVisible.value = true
    return
  }

  const targetNode = findTreeNodeByKey(treeData.value, actionPaths[0])
  if (!targetNode) {
    return
  }

  deleteNode.value = buildNodeData(targetNode)
  deleteConfirmVisible.value = true
}

async function confirmDelete() {
  if (!deleteNode.value) {
    return
  }

  const result = await deleteFile(deleteNode.value.key)
  if (result?.success) {
    selectedPaths.value = selectedPaths.value.filter(path => path !== deleteNode.value?.key)
    if (activePath.value === deleteNode.value.key) {
      activePath.value = null
    }
    if (anchorPath.value === deleteNode.value.key) {
      anchorPath.value = null
    }
    await loadTreeData()
  }

  deleteConfirmVisible.value = false
  deleteNode.value = null
}

async function confirmBatchDelete() {
  const paths = selectedActionPaths.value
  const result = await batchDeleteFiles(paths)
  if (result?.success) {
    clearSelectionState()
    await loadTreeData()
  }

  batchDeleteConfirmVisible.value = false
}

function canDropIntoTarget(targetPath: string): boolean {
  const sourcePaths = dragPaths.value.length > 0 ? dragPaths.value : selectedActionPaths.value
  if (sourcePaths.length === 0) {
    return true
  }

  return sourcePaths.every(path => path !== targetPath && !isAncestorPath(path, targetPath))
}

function allowDrop(info: { dropPosition: 'inside' | 'before' | 'after'; node: TreeOption }) {
  if (info.dropPosition !== 'inside') {
    return false
  }

  const nodeType = (info.node as { nodeType?: string }).nodeType
  if (nodeType !== 'directory') {
    return false
  }

  return canDropIntoTarget(String(info.node.key))
}

function scheduleDragAutoExpand(node: TreeOption): void {
  const nodePath = String(node.key)
  if (
    dragExpandTargetKey.value === nodePath
    || expandedKeys.value.includes(nodePath)
    || (node as { nodeType?: string }).nodeType !== 'directory'
  ) {
    return
  }

  if (dragExpandTimer.value) {
    clearTimeout(dragExpandTimer.value)
  }

  dragExpandTargetKey.value = nodePath
  dragExpandTimer.value = setTimeout(() => {
    dragExpandTimer.value = null
    void ensureExpanded(nodePath)
  }, DRAG_AUTO_EXPAND_DELAY_MS)
}

function handleTreeDragStart(info: { event: DragEvent; node: TreeOption }) {
  const draggedPath = String(info.node.key)
  if (selectedPathSet.value.has(draggedPath)) {
    dragPaths.value = selectedActionPaths.value
  } else {
    setSingleSelection(draggedPath)
    dragPaths.value = [draggedPath]
  }

  if (info.event.dataTransfer) {
    info.event.dataTransfer.effectAllowed = 'move'
    info.event.dataTransfer.setData('text/plain', draggedPath)
  }
}

function handleTreeDragOver(info: { event: DragEvent; node: TreeOption }) {
  const nodeType = (info.node as { nodeType?: string }).nodeType
  const targetPath = String(info.node.key)
  if (nodeType !== 'directory' || !canDropIntoTarget(targetPath)) {
    dragOverKey.value = null
    return
  }

  if (info.event.dataTransfer) {
    info.event.dataTransfer.dropEffect = 'move'
  }

  dragOverKey.value = targetPath
  scheduleDragAutoExpand(info.node)
}

function handleTreeDragLeave(info: { node: TreeOption }) {
  const targetPath = String(info.node.key)
  if (dragOverKey.value === targetPath) {
    dragOverKey.value = null
  }

  if (dragExpandTargetKey.value === targetPath && dragExpandTimer.value) {
    clearTimeout(dragExpandTimer.value)
    dragExpandTimer.value = null
    dragExpandTargetKey.value = null
  }
}

function handleTreeDragEnd() {
  clearDragState()
}

async function handleDrop(info: { node: TreeOption; dragNode: TreeOption; dropPosition: 'inside' | 'before' | 'after' }) {
  const { node, dragNode, dropPosition } = info
  if (dropPosition !== 'inside') {
    clearDragState()
    return
  }

  const draggedPath = String(dragNode.key)
  const targetPath = String(node.key)
  const sourcePaths = dragPaths.value.length > 0
    ? dragPaths.value
    : (selectedActionPaths.value.includes(draggedPath) ? selectedActionPaths.value : [draggedPath])
  const movablePaths = dedupePaths(sourcePaths).filter(path =>
    path !== targetPath && !isAncestorPath(path, targetPath)
  )

  if (movablePaths.length === 0) {
    clearDragState()
    return
  }

  if (!expandedKeys.value.includes(targetPath)) {
    expandedKeys.value = [...expandedKeys.value, targetPath]
  }

  const results = []
  for (const sourcePath of movablePaths) {
    results.push(await moveFile(sourcePath, targetPath))
  }

  clearDragState()

  if (results.every(result => result?.success)) {
    clearSelectionState()
    await loadTreeData()
  }
}

async function handleSendToSession(node: FileTreeNodeData) {
  const mentions = resolveActionPaths(node).map(path => createComposerFileMention({ fullPath: path }))
  await sendFileReferencesToSession({
    sourceProjectId: props.projectId,
    mentions
  })
}

function renderLabel({ option }: { option: TreeOption }) {
  const nodeType = (option as { nodeType?: string }).nodeType ?? 'file'
  const fileName = option.label as string
  const extension = (option as { extension?: string }).extension
  const iconMeta = resolveFileIcon(nodeType, fileName, extension)

  return h('div', {
    class: 'file-tree-node__content',
    onClick: (event: MouseEvent) => handleNodeClick(event, option),
    onContextmenu: (event: MouseEvent) => handleContextMenu(event, option)
  }, [
    h(EaIcon, {
      name: iconMeta.icon,
      size: 14,
      class: 'file-tree-node__icon',
      style: { color: iconMeta.color }
    }),
    h('span', { class: 'file-tree-node__name' }, fileName)
  ])
}

function resolveNodeProps({ option }: { option: TreeOption }) {
  const nodePath = String(option.key)

  return {
    class: [
      'file-tree-node',
      selectedPathSet.value.has(nodePath) && 'file-tree-node--selected',
      activePath.value === nodePath && 'file-tree-node--active',
      dragOverKey.value === nodePath && 'file-tree-node--drop-target'
    ]
  }
}

function handleClickOutside() {
  closeContextMenu()
}

function handleDocumentKeydown(event: KeyboardEvent) {
  const root = rootRef.value
  const target = event.target
  if (!root || !(target instanceof Node)) {
    return
  }

  if (!root.contains(target) && document.activeElement !== root) {
    return
  }

  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || (target instanceof HTMLElement && target.isContentEditable)
  ) {
    return
  }

  if (event.key === 'Escape') {
    closeContextMenu()
    return
  }

  if (event.key !== 'Delete' && event.key !== 'Backspace') {
    return
  }

  if (selectedActionPaths.value.length > 0) {
    event.preventDefault()
    handleDeleteSelection()
    return
  }

  if (!activePath.value) {
    return
  }

  const selectedNode = findTreeNodeByKey(treeData.value, activePath.value)
  if (!selectedNode) {
    return
  }

  event.preventDefault()
  handleDelete(buildNodeData(selectedNode))
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleDocumentKeydown)
  void loadTreeData()
  void startFileWatcher(props.projectPath)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleDocumentKeydown)
  stopFileWatcher()
  clearDragState()
})

watch(() => props.projectPath, async (newPath, oldPath) => {
  if (newPath === oldPath) {
    return
  }

  directoryChildrenCache.value = new Map()
  clearSelectionState()
  closeContextMenu()
  clearDragState()
  await loadTreeData()
  await startFileWatcher(newPath)
})
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

<style scoped>
.file-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  outline: none;
}

.file-tree__n-tree {
  flex: 1;
  overflow: auto;
  --n-font-size: var(--font-size-xs) !important;
  --n-text-color: var(--color-text-secondary) !important;
  --n-node-text-color: var(--color-text-secondary) !important;
  --n-node-text-color-hover: var(--color-text-primary) !important;
  --n-node-text-color-active: var(--color-primary) !important;
  --n-node-text-color-selected: var(--color-primary) !important;
  --n-node-color-hover: var(--color-surface-hover) !important;
  --n-node-color-active: transparent !important;
  --n-node-color-selected: transparent !important;
  --n-arrow-color: var(--color-text-tertiary) !important;
  --n-line-color: var(--color-border) !important;
  padding: var(--spacing-1) 0;
}

.file-tree__n-tree:focus,
.file-tree__n-tree:focus-visible,
.file-tree__n-tree :deep(.n-tree-node-content:focus),
.file-tree__n-tree :deep(.n-tree-node-content:focus-visible) {
  outline: none !important;
}

.file-tree__n-tree :deep(.n-tree-node) {
  padding: 2px 0;
}

.file-tree__n-tree :deep(.n-tree-node-wrapper) {
  padding: 0 4px;
}

.file-tree__n-tree :deep(.n-tree-switcher) {
  width: 16px !important;
  height: 16px !important;
}

.file-tree__n-tree :deep(.file-tree-node) {
  padding: 5px 10px !important;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast) var(--easing-default),
    box-shadow var(--transition-fast) var(--easing-default);
}

.file-tree__n-tree :deep(.n-tree-node-content) {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.file-tree__n-tree :deep(.n-tree-node-content__text) {
  display: flex;
  flex: 1;
  min-width: 0;
}

.file-tree__n-tree :deep(.file-tree-node--selected) {
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.file-tree__n-tree :deep(.file-tree-node--active) {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary) 42%, transparent);
}

.file-tree__n-tree :deep(.file-tree-node--drop-target) {
  background: color-mix(in srgb, var(--color-success) 14%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-success) 42%, transparent);
}

.file-tree__n-tree :deep(.file-tree-node__content) {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  width: 100%;
  min-width: 0;
  cursor: pointer;
}

.file-tree__n-tree :deep(.file-tree-node__icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.file-tree__n-tree :deep(.file-tree-node__name) {
  display: flex;
  align-items: center;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.35;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.confirm-dialog {
  width: 400px;
  max-width: 90vw;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.confirm-dialog__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-6);
  text-align: center;
}

.confirm-dialog__icon {
  color: var(--color-warning);
  margin-bottom: var(--spacing-4);
}

.confirm-dialog__title {
  margin: 0 0 var(--spacing-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.confirm-dialog__message {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-6);
  border-top: 1px solid var(--color-border);
}
</style>
