<script setup lang="ts">
import { computed } from 'vue'

export type EaTagVariant = 'default' | 'primary' | 'success' | 'info' | 'warning' | 'danger'
export type EaTagSize = 'sm' | 'md'

export interface EaTagProps {
  variant?: EaTagVariant
  size?: EaTagSize
  rounded?: boolean
}

const props = withDefaults(defineProps<EaTagProps>(), {
  variant: 'default',
  size: 'md',
  rounded: false
})

const tagClasses = computed(() => [
  'ea-tag',
  `ea-tag--${props.variant}`,
  `ea-tag--${props.size}`,
  {
    'ea-tag--rounded': props.rounded
  }
])
</script>

<template>
  <span :class="tagClasses">
    <slot />
  </span>
</template>

<style scoped>
.ea-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  white-space: nowrap;
  border-radius: var(--radius-sm);
  font-weight: var(--font-weight-medium);
  line-height: 1;
  border: 1px solid transparent;
}

.ea-tag--sm {
  height: 20px;
  padding: 0 6px;
  font-size: var(--font-size-xs);
}

.ea-tag--md {
  height: 24px;
  padding: 0 var(--spacing-2);
  font-size: var(--font-size-sm);
}

.ea-tag--rounded {
  border-radius: var(--radius-full);
}

.ea-tag--default {
  color: var(--color-text-secondary);
  background-color: var(--color-bg-tertiary);
  border-color: var(--color-border);
}

.ea-tag--primary {
  color: var(--color-primary-dark);
  background-color: var(--color-primary-light);
  border-color: color-mix(in srgb, var(--color-primary) 30%, transparent);
}

.ea-tag--success {
  color: var(--color-success-dark);
  background-color: var(--color-success-light);
  border-color: color-mix(in srgb, var(--color-success) 30%, transparent);
}

.ea-tag--info {
  color: var(--color-info-dark);
  background-color: var(--color-info-light);
  border-color: color-mix(in srgb, var(--color-info) 30%, transparent);
}

.ea-tag--warning {
  color: var(--color-warning-dark);
  background-color: var(--color-warning-light);
  border-color: color-mix(in srgb, var(--color-warning) 30%, transparent);
}

.ea-tag--danger {
  color: var(--color-error-dark);
  background-color: var(--color-error-light);
  border-color: color-mix(in srgb, var(--color-error) 30%, transparent);
}
</style>
