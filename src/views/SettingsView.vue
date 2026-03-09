<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import { EaIcon } from '@/components/common'
import SettingsNav from '@/components/settings/SettingsNav.vue'
import SettingsContent from '@/components/settings/SettingsContent.vue'

const { t } = useI18n()
const router = useRouter()
const settingsStore = useSettingsStore()

onMounted(async () => {
  await settingsStore.loadSettings()
})

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="settings-view">
    <header class="settings-view__header">
      <button
        class="settings-view__back"
        @click="goBack"
      >
        <EaIcon
          name="arrow-left"
          :size="18"
        />
        <span>{{ t('common.back') }}</span>
      </button>

      <h1 class="settings-view__title">
        {{ t('settings.title') }}
      </h1>
    </header>

    <div class="settings-view__body">
      <SettingsNav />
      <SettingsContent />
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
}

.settings-view__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  padding: var(--spacing-4) var(--spacing-6);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-elevated);
  flex-shrink: 0;
}

.settings-view__back {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  background: var(--color-surface);
  transition: all var(--transition-fast) var(--easing-default);
}

.settings-view__back:hover {
  color: var(--color-text-primary);
  background: var(--color-surface-hover);
}

.settings-view__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.settings-view__body {
  min-height: 0;
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
