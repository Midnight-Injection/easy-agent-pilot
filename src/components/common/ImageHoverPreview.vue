<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch, type StyleValue } from 'vue'

interface ImageHoverPreviewProps {
  src: string
  alt: string
  title?: string
  wrapperClass?: string
  imageClass?: string
  wrapperStyle?: StyleValue
  imageStyle?: StyleValue
  previewMaxWidth?: number
  previewMaxHeight?: number
  disabled?: boolean
}

const props = withDefaults(defineProps<ImageHoverPreviewProps>(), {
  title: '',
  wrapperClass: '',
  imageClass: '',
  wrapperStyle: undefined,
  imageStyle: undefined,
  previewMaxWidth: 360,
  previewMaxHeight: 420,
  disabled: false
})

const triggerRef = ref<HTMLElement | null>(null)
const previewRef = ref<HTMLElement | null>(null)
const isPreviewVisible = ref(false)
const previewPosition = ref({ top: 0, left: 0 })

let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

const previewStyle = computed(() => ({
  top: `${previewPosition.value.top}px`,
  left: `${previewPosition.value.left}px`,
  maxWidth: `${props.previewMaxWidth}px`,
  maxHeight: `${props.previewMaxHeight}px`
}))

const displayTitle = computed(() => props.title.trim() || props.alt.trim())

function clearShowTimer() {
  if (!showTimer) return
  clearTimeout(showTimer)
  showTimer = null
}

function clearHideTimer() {
  if (!hideTimer) return
  clearTimeout(hideTimer)
  hideTimer = null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function updatePreviewPosition() {
  if (!triggerRef.value || !previewRef.value) return

  const triggerRect = triggerRef.value.getBoundingClientRect()
  const previewRect = previewRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const gap = 14

  const canPlaceRight = triggerRect.right + gap + previewRect.width <= viewportWidth - gap
  const canPlaceLeft = triggerRect.left - gap - previewRect.width >= gap

  const left = canPlaceRight
    ? triggerRect.right + gap
    : canPlaceLeft
      ? triggerRect.left - previewRect.width - gap
      : clamp(
          triggerRect.left + (triggerRect.width - previewRect.width) / 2,
          gap,
          viewportWidth - previewRect.width - gap
        )

  const top = clamp(
    triggerRect.top + (triggerRect.height - previewRect.height) / 2,
    gap,
    viewportHeight - previewRect.height - gap
  )

  previewPosition.value = { top, left }
}

function showPreview() {
  if (props.disabled || !props.src) return

  clearHideTimer()
  clearShowTimer()
  showTimer = setTimeout(() => {
    isPreviewVisible.value = true
  }, 110)
}

function hidePreview() {
  clearShowTimer()
  clearHideTimer()
  hideTimer = setTimeout(() => {
    isPreviewVisible.value = false
  }, 90)
}

function handleViewportChange() {
  if (!isPreviewVisible.value) return
  updatePreviewPosition()
}

watch(isPreviewVisible, async visible => {
  if (!visible) return

  await nextTick()
  updatePreviewPosition()
})

watch(
  () => props.src,
  () => {
    isPreviewVisible.value = false
    clearShowTimer()
    clearHideTimer()
  }
)

watch(isPreviewVisible, visible => {
  if (visible) {
    window.addEventListener('scroll', handleViewportChange, true)
    window.addEventListener('resize', handleViewportChange)
    return
  }

  window.removeEventListener('scroll', handleViewportChange, true)
  window.removeEventListener('resize', handleViewportChange)
})

onBeforeUnmount(() => {
  clearShowTimer()
  clearHideTimer()
  window.removeEventListener('scroll', handleViewportChange, true)
  window.removeEventListener('resize', handleViewportChange)
})
</script>

<template>
  <div
    ref="triggerRef"
    class="image-hover-preview"
    :class="wrapperClass"
    :style="wrapperStyle"
    tabindex="0"
    @mouseenter="showPreview"
    @mouseleave="hidePreview"
    @focusin="showPreview"
    @focusout="hidePreview"
  >
    <img
      :src="src"
      :alt="alt"
      :title="displayTitle || undefined"
      class="image-hover-preview__image"
      :class="imageClass"
      :style="imageStyle"
    >
    <slot />
  </div>

  <Teleport to="body">
    <Transition name="image-hover-preview-fade">
      <div
        v-if="isPreviewVisible"
        ref="previewRef"
        class="image-hover-preview__panel"
        :style="previewStyle"
        @mouseenter="showPreview"
        @mouseleave="hidePreview"
      >
        <img
          :src="src"
          :alt="alt"
          class="image-hover-preview__panel-image"
        >
        <div
          v-if="displayTitle"
          class="image-hover-preview__panel-title"
        >
          {{ displayTitle }}
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-hover-preview {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  outline: none;
}

.image-hover-preview__image {
  display: block;
  width: 100%;
  height: 100%;
}

.image-hover-preview__panel {
  position: fixed;
  z-index: var(--z-tooltip);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, transparent);
  background: color-mix(in srgb, var(--color-surface) 92%, rgba(255, 255, 255, 0.72));
  box-shadow: 0 22px 44px rgba(15, 23, 42, 0.22);
  backdrop-filter: blur(18px);
}

.image-hover-preview__panel-image {
  display: block;
  width: auto;
  max-width: min(72vw, 100%);
  max-height: min(58vh, 100%);
  border-radius: 12px;
  object-fit: contain;
  background: rgba(15, 23, 42, 0.05);
}

.image-hover-preview__panel-title {
  max-width: min(72vw, 100%);
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text-secondary);
  word-break: break-word;
}

.image-hover-preview-fade-enter-active,
.image-hover-preview-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.image-hover-preview-fade-enter-from,
.image-hover-preview-fade-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

:global([data-theme='dark']) .image-hover-preview__panel,
:global(.dark) .image-hover-preview__panel {
  border-color: rgba(71, 85, 105, 0.82);
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 22px 44px rgba(2, 6, 23, 0.4);
}

:global([data-theme='dark']) .image-hover-preview__panel-image,
:global(.dark) .image-hover-preview__panel-image {
  background: rgba(255, 255, 255, 0.04);
}

:global([data-theme='dark']) .image-hover-preview__panel-title,
:global(.dark) .image-hover-preview__panel-title {
  color: #cbd5e1;
}
</style>
