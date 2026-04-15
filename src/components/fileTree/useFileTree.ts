import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import type { UnwatchFn } from '@tauri-apps/plugin-fs'
import type { TreeOption } from 'naive-ui'
import { EaIcon } from '@/components/common'
import { useSessionFileReference } from '@/composables'
import type { FileTreeNode } from '@/stores/project'
import { createComposerFileMention } from '@/utils/composerFileMention'
import { resolveFileIcon } from '@/utils/fileIcon'
import { startFsWatcher } from '@/utils/fsWatcher'
import { useFileOperations } from './composables/useFileOperations'
import type { ContextMenuContext, CreateEntryType, FileTreeNodeData } from './types'

export interface FileTreeProps {
  projectId: string
  projectPath: string
}

export type FileTreeEmits = {
  (event: 'fileSelect', path: string): void
}

interface LoadTreeDataOptions {
  resetChildCache?: boolean
}

const DRAG_AUTO_EXPAND_DELAY_MS = 420

/**
 * 文件树视图状态。
 * 负责目录懒加载、选择态、右键操作、文件监听和拖拽移动。
 */
export function useFileTree(props: FileTreeProps, emit: FileTreeEmits) {
  const { t } = useI18n()
  const { createEntry, renameFile, deleteFile, batchDeleteFiles, moveFile, loading } = useFileOperations()
  const { sendFileReferencesToSession } = useSessionFileReference()

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
  const pendingResetChildCache = ref(false)
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
      items.forEach(item => {
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

  async function loadTreeData(options: LoadTreeDataOptions = {}) {
    if (isLoading.value) {
      pendingReload.value = true
      pendingResetChildCache.value = pendingResetChildCache.value || Boolean(options.resetChildCache)
      return
    }

    isLoading.value = true
    try {
      if (options.resetChildCache && directoryChildrenCache.value.size > 0) {
        directoryChildrenCache.value = new Map()
      }

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
        const shouldResetChildCache = pendingResetChildCache.value
        pendingReload.value = false
        pendingResetChildCache.value = false
        await loadTreeData({ resetChildCache: shouldResetChildCache })
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
      void loadTreeData({ resetChildCache: true })
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

  async function loadChildrenForNode(node: TreeOption, forceRefresh = false): Promise<void> {
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
      await loadTreeData({ resetChildCache: true })
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
      await loadTreeData({ resetChildCache: true })
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
      await loadTreeData({ resetChildCache: true })
    }

    deleteConfirmVisible.value = false
    deleteNode.value = null
  }

  async function confirmBatchDelete() {
    const paths = selectedActionPaths.value
    const result = await batchDeleteFiles(paths)
    if (result?.success) {
      clearSelectionState()
      await loadTreeData({ resetChildCache: true })
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
      await loadTreeData({ resetChildCache: true })
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

  watch(
    () => props.projectPath,
    async (newPath, oldPath) => {
      if (newPath === oldPath) {
        return
      }

      directoryChildrenCache.value = new Map()
      pendingResetChildCache.value = false
      clearSelectionState()
      closeContextMenu()
      clearDragState()
      await loadTreeData({ resetChildCache: true })
      await startFileWatcher(newPath)
    }
  )

  return {
    t,
    loading,
    rootRef,
    treeData,
    expandedKeys,
    selectedPaths,
    contextMenuContext,
    renameDialogVisible,
    renameNode,
    createDialogVisible,
    createTargetNode,
    createEntryType,
    deleteConfirmVisible,
    deleteNode,
    batchDeleteConfirmVisible,
    isLoading,
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
    handleDeleteSelection,
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
  }
}
