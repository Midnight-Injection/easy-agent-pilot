<script setup lang="ts">
import { computed } from 'vue'

export type EaLoadingSize = 'sm' | 'md' | 'lg'

export interface EaLoadingProps {
  message?: string
  size?: EaLoadingSize
}

const props = withDefaults(defineProps<EaLoadingProps>(), {
  message: '',
  size: 'md'
})

const loadingClasses = computed(() => [
  'ea-loading',
  `ea-loading--${props.size}`
])
</script>

<template>
  <div :class="loadingClasses">
    <div class="ea-loading__spinner">
      <svg
        viewBox="0 0 24 24"
        class="ea-loading__spinner-svg"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="2.5"
          fill="none"
          stroke-dasharray="31.416"
          stroke-dashoffset="10"
        />
      </svg>
    </div>
    <p
      v-if="message"
      class="ea-loading__message"
    >
      {{ message }}
    </p>
  </div>
</template>

<style scoped>
.ea-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  width: 100%;
  padding: var(--spacing-8);
  color: var(--color-text-secondary);
}

.ea-loading__spinner {
  color: var(--color-primary);
}

.ea-loading__spinner-svg {
  width: 100%;
  height: 100%;
  animation: ea-loading-spin 1s linear infinite;
}

.ea-loading__message {
  margin: 0;
  font-size: var(--font-size-sm);
}

.ea-loading--sm .ea-loading__spinner {
  width: 20px;
  height: 20px;
}

.ea-loading--md .ea-loading__spinner {
  width: 32px;
  height: 32px;
}

.ea-loading--lg .ea-loading__spinner {
  width: 44px;
  height: 44px;
}

@keyframes ea-loading-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
