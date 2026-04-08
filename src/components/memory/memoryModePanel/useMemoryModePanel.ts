import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { SelectOption } from '@/components/common/EaSelect.vue'
import { useMemoryStore } from '@/stores/memory'
import { useProjectStore } from '@/stores/project'
import type {
  CreateMemoryLibraryInput,
  CreateRawMemoryRecordInput,
  MemoryLibrary,
  RawMemoryRecord,
  UpdateMemoryLibraryInput,
  UpdateRawMemoryRecordInput
} from '@/types/memory'

/**
 * 记忆模式面板逻辑。
 * 负责记忆库、原始记忆、批量删除和合并入库的状态编排，不处理渲染结构。
 */
export function useMemoryModePanel() {
  const memoryStore = useMemoryStore()
  const projectStore = useProjectStore()

  const search = ref('')
  const projectFilter = ref<string>('all')
  const selectedRecordId = ref<string | null>(null)
  const libraryModalVisible = ref(false)
  const libraryEditing = ref<MemoryLibrary | null>(null)
  const rawModalVisible = ref(false)
  const rawEditing = ref<RawMemoryRecord | null>(null)
  const mergeModalVisible = ref(false)
  const batchDeleteModalVisible = ref(false)
  const libraryContentDraft = ref('')
  const libraryContentDirty = ref(false)

  let filterTimer: ReturnType<typeof setTimeout> | null = null

  const selectedRecord = computed(() => (
    memoryStore.rawRecords.find(record => record.id === selectedRecordId.value) ?? null
  ))

  const projectOptions = computed<SelectOption[]>(() => [
    { value: 'all', label: '全部项目' },
    ...projectStore.projects.map(project => ({
      value: project.id,
      label: project.name
    }))
  ])

  const currentProjectLabel = computed(() => (
    projectOptions.value.find(option => option.value === projectFilter.value)?.label ?? '全部项目'
  ))

  const sortedLibraries = computed(() => (
    [...memoryStore.libraries].sort((left, right) => (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ))
  ))

  const canSaveLibrary = computed(() => Boolean(memoryStore.activeLibrary && libraryContentDirty.value))

  watch(
    () => memoryStore.activeLibrary,
    (library) => {
      libraryContentDraft.value = library?.contentMd ?? ''
      libraryContentDirty.value = false
    },
    { immediate: true }
  )

  watch(search, triggerReload)
  watch(projectFilter, triggerReload)

  function triggerReload() {
    if (filterTimer) {
      clearTimeout(filterTimer)
    }

    filterTimer = setTimeout(() => {
      void reloadRawRecords()
    }, 180)
  }

  async function reloadRawRecords() {
    await memoryStore.loadRawRecords({
      search: search.value.trim() || undefined,
      projectId: projectFilter.value !== 'all' ? projectFilter.value : undefined
    })
  }

  function openLibraryCreate() {
    libraryEditing.value = null
    libraryModalVisible.value = true
  }

  function openLibraryEdit(library: MemoryLibrary) {
    libraryEditing.value = library
    libraryModalVisible.value = true
  }

  function openRawCreate() {
    rawEditing.value = null
    rawModalVisible.value = true
  }

  function openRawEdit(record: RawMemoryRecord) {
    rawEditing.value = record
    rawModalVisible.value = true
  }

  async function handleLibrarySubmit(payload: { name: string; description?: string }) {
    if (libraryEditing.value) {
      await memoryStore.updateLibrary(libraryEditing.value.id, payload as UpdateMemoryLibraryInput)
    } else {
      await memoryStore.createLibrary(payload as CreateMemoryLibraryInput)
    }

    libraryModalVisible.value = false
  }

  async function handleRawSubmit(payload: { content: string }) {
    if (rawEditing.value) {
      const record = await memoryStore.updateRawRecord(
        rawEditing.value.id,
        payload as UpdateRawMemoryRecordInput
      )
      selectedRecordId.value = record.id
    } else {
      const record = await memoryStore.createRawRecord({
        content: payload.content,
        projectId: projectStore.currentProjectId ?? undefined,
        sourceRole: 'user'
      } as CreateRawMemoryRecordInput)
      selectedRecordId.value = record.id
    }

    rawModalVisible.value = false
  }

  async function handleDeleteLibrary(library: MemoryLibrary) {
    if (!window.confirm(`确定删除记忆库「${library.name}」吗？`)) {
      return
    }

    await memoryStore.deleteLibrary(library.id)
  }

  async function handleDeleteRecord(record: RawMemoryRecord) {
    if (!window.confirm('确定删除这条原始记忆吗？')) {
      return
    }

    await memoryStore.deleteRawRecord(record.id)
    if (selectedRecordId.value === record.id) {
      selectedRecordId.value = null
    }
  }

  async function handleBatchDeleteConfirm(payload: {
    startAt?: string
    endAt?: string
    limit?: number
    deleteOrder?: 'oldest' | 'latest'
  }) {
    const scopeText = [
      currentProjectLabel.value !== '全部项目' ? `项目：${currentProjectLabel.value}` : '',
      search.value.trim() ? `搜索：${search.value.trim()}` : ''
    ].filter(Boolean).join('，')

    const actionText = payload.limit
      ? `按条件批量删除 ${payload.limit} 条原始记忆`
      : '按时间范围批量删除原始记忆'

    if (!window.confirm(`${actionText}${scopeText ? `（${scopeText}）` : ''}，确认继续吗？`)) {
      return
    }

    const result = await memoryStore.batchDeleteRawRecords(payload)
    batchDeleteModalVisible.value = false
    if (selectedRecordId.value && result.deletedIds.includes(selectedRecordId.value)) {
      selectedRecordId.value = null
    }
  }

  async function handleSaveLibrary() {
    const library = memoryStore.activeLibrary
    if (!library) {
      return
    }

    const updated = await memoryStore.updateLibrary(library.id, {
      contentMd: libraryContentDraft.value
    })
    libraryContentDraft.value = updated.contentMd
    libraryContentDirty.value = false
  }

  async function handleMergeConfirm(payload: { libraryId: string; agentId?: string }) {
    mergeModalVisible.value = false
    const result = await memoryStore.mergeIntoLibrary({
      libraryId: payload.libraryId,
      agentId: payload.agentId,
      recordIds: memoryStore.selectedRecordIds
    })
    libraryContentDraft.value = result.library.contentMd
    libraryContentDirty.value = false
  }

  onMounted(async () => {
    await memoryStore.initialize()
    if (projectStore.projects.length === 0) {
      await projectStore.loadProjects()
    }
  })

  onUnmounted(() => {
    if (filterTimer) {
      clearTimeout(filterTimer)
    }
  })

  return {
    memoryStore,
    search,
    projectFilter,
    selectedRecordId,
    selectedRecord,
    projectOptions,
    currentProjectLabel,
    sortedLibraries,
    canSaveLibrary,
    libraryModalVisible,
    libraryEditing,
    rawModalVisible,
    rawEditing,
    mergeModalVisible,
    batchDeleteModalVisible,
    libraryContentDraft,
    libraryContentDirty,
    reloadRawRecords,
    openLibraryCreate,
    openLibraryEdit,
    openRawCreate,
    openRawEdit,
    handleLibrarySubmit,
    handleRawSubmit,
    handleDeleteLibrary,
    handleDeleteRecord,
    handleBatchDeleteConfirm,
    handleSaveLibrary,
    handleMergeConfirm
  }
}
