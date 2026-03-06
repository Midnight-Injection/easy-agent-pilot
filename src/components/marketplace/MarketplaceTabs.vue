<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useMarketplaceStore } from '@/stores/marketplace'
import { EaIcon } from '@/components/common'

const { t } = useI18n()
const marketplaceStore = useMarketplaceStore()

interface TabItem {
  id: 'mcp' | 'skills' | 'plugins'
  labelKey: string
  icon: string
}

const tabs: TabItem[] = [
  { id: 'mcp', labelKey: 'marketplace.tabs.mcp', icon: 'plug' },
  { id: 'skills', labelKey: 'marketplace.tabs.skills', icon: 'sparkles' },
  { id: 'plugins', labelKey: 'marketplace.tabs.plugins', icon: 'puzzle' }
]
</script>

<template>
  <div class="marketplace-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      :class="['marketplace-tabs__tab', { 'marketplace-tabs__tab--active': marketplaceStore.activeMarketTab === tab.id }]"
      @click="marketplaceStore.setActiveMarketTab(tab.id)"
    >
      <EaIcon :name="tab.icon" :size="16" />
      <span>{{ t(tab.labelKey) }}</span>
      <span
        v-if="tab.id === 'mcp' && marketplaceStore.installedMcps.length > 0"
        class="marketplace-tabs__badge"
      >
        {{ marketplaceStore.installedMcps.length }}
      </span>
      <span
        v-if="tab.id === 'skills' && marketplaceStore.installedSkills.length > 0"
        class="marketplace-tabs__badge"
      >
        {{ marketplaceStore.installedSkills.length }}
      </span>
      <span
        v-if="tab.id === 'plugins' && marketplaceStore.installedPlugins.length > 0"
        class="marketplace-tabs__badge"
      >
        {{ marketplaceStore.installedPlugins.length }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.marketplace-tabs {
  display: flex;
  gap: var(--spacing-2);
  padding: 0 var(--spacing-6);
  background-color: var(--color-bg-primary);
  border-bottom: 1px solid var(--color-border);
}

.marketplace-tabs__tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3) var(--spacing-4);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.marketplace-tabs__tab:hover {
  color: var(--color-text-primary);
}

.marketplace-tabs__tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.marketplace-tabs__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 var(--spacing-1);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-bg-primary);
  background-color: var(--color-primary);
  border-radius: var(--radius-full);
}
</style>
