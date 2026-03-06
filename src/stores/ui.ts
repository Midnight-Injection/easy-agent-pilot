import { defineStore } from 'pinia'
import { ref } from 'vue'

export type SettingsTab = 'general' | 'agents' | 'agentConfig' | 'integration' | 'theme' | 'data' | 'providerSwitch' | 'lsp'

export type AppMode = 'chat' | 'plan'
export type MainContentMode = 'chat' | 'fileEditor'

export const useUIStore = defineStore('ui', () => {
  // State
  const settingsModalVisible = ref(false)
  const activeSettingsTab = ref<SettingsTab>('general')
  const settingsNavCollapsed = ref(true)
  const projectCreateModalVisible = ref(false)
  const sessionCreateModalVisible = ref(false)
  const appMode = ref<AppMode>('chat')
  const mainContentMode = ref<MainContentMode>('chat')

  // Actions
  function openSettings(tab?: SettingsTab) {
    if (tab) {
      activeSettingsTab.value = tab
    }
    settingsModalVisible.value = true
  }

  function closeSettings() {
    settingsModalVisible.value = false
  }

  function toggleSettings() {
    settingsModalVisible.value = !settingsModalVisible.value
  }

  function setActiveSettingsTab(tab: SettingsTab) {
    activeSettingsTab.value = tab
  }

  function openProjectCreateModal() {
    projectCreateModalVisible.value = true
  }

  function closeProjectCreateModal() {
    projectCreateModalVisible.value = false
  }

  function openSessionCreateModal() {
    sessionCreateModalVisible.value = true
  }

  function closeSessionCreateModal() {
    sessionCreateModalVisible.value = false
  }

  function setAppMode(mode: AppMode) {
    appMode.value = mode
  }

  function setMainContentMode(mode: MainContentMode) {
    mainContentMode.value = mode
  }

  function toggleAppMode() {
    appMode.value = appMode.value === 'chat' ? 'plan' : 'chat'
  }

  function toggleSettingsNav() {
    settingsNavCollapsed.value = !settingsNavCollapsed.value
  }

  function setSettingsNavCollapsed(collapsed: boolean) {
    settingsNavCollapsed.value = collapsed
  }

  return {
    // State
    settingsModalVisible,
    activeSettingsTab,
    settingsNavCollapsed,
    projectCreateModalVisible,
    sessionCreateModalVisible,
    appMode,
    mainContentMode,
    // Actions
    openSettings,
    closeSettings,
    toggleSettings,
    setActiveSettingsTab,
    toggleSettingsNav,
    setSettingsNavCollapsed,
    openProjectCreateModal,
    closeProjectCreateModal,
    openSessionCreateModal,
    closeSessionCreateModal,
    setAppMode,
    setMainContentMode,
    toggleAppMode
  }
})
