<script setup lang="ts">
import { ref } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import type { RuntimeNotice } from '@/utils/runtimeNotice'
import { getUsageNoticeSummary, summarizeRuntimeNotice } from '@/utils/runtimeNotice'

const props = withDefaults(defineProps<{
  notices: RuntimeNotice[]
  defaultExpanded?: boolean
}>(), {
  defaultExpanded: false
})

const expandedIds = ref<Set<string>>(new Set(
  props.defaultExpanded ? props.notices.map(notice => notice.id) : []
))

function toggleNotice(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedIds.value = next
}

function isExpanded(id: string) {
  return expandedIds.value.has(id)
}

function noticeChips(notice: RuntimeNotice) {
  return summarizeRuntimeNotice(notice)
}

function isUsageNotice(notice: RuntimeNotice) {
  return notice.id === 'usage' || notice.title.includes('用量')
}

function usageSummary(notice: RuntimeNotice) {
  return getUsageNoticeSummary(notice)
}
</script>

<template>
  <div class="runtime-notice-list">
    <article
      v-for="notice in notices"
      :key="notice.id"
      class="runtime-notice"
      :class="[
        `runtime-notice--${notice.tone || 'info'}`,
        { 'runtime-notice--usage': isUsageNotice(notice) }
      ]"
    >
      <div
        v-if="isUsageNotice(notice)"
        class="runtime-notice__usage"
      >
        <div class="runtime-notice__usage-main">
          <span class="runtime-notice__usage-label">Model</span>
          <span class="runtime-notice__usage-model">
            {{ usageSummary(notice)?.model || 'Unknown' }}
          </span>
        </div>
        <div class="runtime-notice__usage-stats">
          <span class="runtime-notice__usage-chip runtime-notice__usage-chip--input">
            In {{ usageSummary(notice)?.input || '0' }}
          </span>
          <span class="runtime-notice__usage-chip runtime-notice__usage-chip--output">
            Out {{ usageSummary(notice)?.output || '0' }}
          </span>
        </div>
      </div>

      <template v-else>
        <button
          type="button"
          class="runtime-notice__header"
          @click="toggleNotice(notice.id)"
        >
          <div class="runtime-notice__header-main">
            <span class="runtime-notice__eyebrow">Runtime</span>
            <span class="runtime-notice__title">{{ notice.title }}</span>
          </div>
          <div class="runtime-notice__header-side">
            <div
              v-if="noticeChips(notice).length > 0"
              class="runtime-notice__chips"
            >
              <span
                v-for="chip in noticeChips(notice)"
                :key="chip"
                class="runtime-notice__chip"
              >
                {{ chip }}
              </span>
            </div>
            <span
              class="runtime-notice__chevron"
              :class="{ 'runtime-notice__chevron--expanded': isExpanded(notice.id) }"
            >▼</span>
          </div>
        </button>

        <div
          v-show="isExpanded(notice.id)"
          class="runtime-notice__content"
        >
          <MarkdownRenderer :content="notice.content" />
        </div>
      </template>
    </article>
  </div>
</template>

<style scoped>
.runtime-notice-list {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.runtime-notice {
  border-radius: 1rem;
  border: 1px solid var(--runtime-notice-border);
  background: var(--runtime-notice-bg);
  box-shadow: var(--runtime-notice-shadow);
  overflow: hidden;
}

.runtime-notice--usage {
  border-color: var(--runtime-notice-usage-border);
  background: var(--runtime-notice-usage-bg);
}

.runtime-notice--info {
  border-color: rgba(14, 165, 233, 0.16);
}

.runtime-notice--success {
  border-color: rgba(34, 197, 94, 0.18);
}

.runtime-notice--warning {
  border-color: rgba(245, 158, 11, 0.2);
}

.runtime-notice__header {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.9rem;
  padding: 0.8rem 0.9rem;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.runtime-notice__header:hover {
  background: var(--runtime-notice-hover);
}

.runtime-notice__header-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.runtime-notice__eyebrow {
  font-size: 0.63rem;
  line-height: 1;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}

.runtime-notice__title {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.runtime-notice__header-side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  min-width: 0;
  flex: 1;
}

.runtime-notice__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.35rem;
  min-width: 0;
}

.runtime-notice__chip {
  max-width: 100%;
  padding: 0.26rem 0.55rem;
  border-radius: 999px;
  background: var(--runtime-notice-chip-bg);
  color: var(--runtime-notice-chip-text);
  font-size: 0.7rem;
  line-height: 1.1;
  white-space: nowrap;
}

.runtime-notice__chevron {
  flex-shrink: 0;
  font-size: 0.68rem;
  color: var(--color-text-tertiary);
  transition: transform 0.18s ease;
}

.runtime-notice__chevron--expanded {
  transform: rotate(180deg);
}

.runtime-notice__content {
  padding: 0 0.95rem 0.9rem;
  border-top: 1px solid var(--runtime-notice-content-border);
}

.runtime-notice__usage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.9rem;
  padding: 0.8rem 0.95rem;
}

.runtime-notice__usage-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
}

.runtime-notice__usage-label {
  font-size: 0.63rem;
  line-height: 1;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--runtime-notice-usage-label);
}

.runtime-notice__usage-model {
  min-width: 0;
  font-size: 0.96rem;
  font-weight: 700;
  color: var(--runtime-notice-usage-model);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.runtime-notice__usage-stats {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.runtime-notice__usage-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.9rem;
  padding: 0 0.72rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.runtime-notice__usage-chip--input {
  background: var(--runtime-notice-usage-input-bg);
  color: var(--runtime-notice-usage-input-text);
}

.runtime-notice__usage-chip--output {
  background: var(--runtime-notice-usage-output-bg);
  color: var(--runtime-notice-usage-output-text);
}
</style>
