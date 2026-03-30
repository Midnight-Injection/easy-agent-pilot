<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { FormField } from '@/types/plan'
import { useThemeStore } from '@/stores/theme'

const props = defineProps<{
  field: FormField
  modelValue: string | number
  error?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
}>()

const themeStore = useThemeStore()
const isDarkTheme = computed(() => themeStore.isDark)

const inputId = computed(() => `field-${props.field.name}`)
const field = computed(() => props.field)
const OTHER_VALUE = '__other__'
const isOtherSelected = ref(false)
const otherValue = ref('')
const hasExplicitOtherOption = computed(() =>
  props.field.options?.some(option => String(option.value) === OTHER_VALUE) ?? false
)
const optionReasons = computed(() => props.field.optionReasons ?? {})
const recommendedValues = computed(() => {
  if (Array.isArray(props.field.suggestion)) {
    return props.field.suggestion.map(value => String(value))
  }

  if (props.field.suggestion === undefined || props.field.suggestion === null || props.field.suggestion === '') {
    return []
  }

  return [String(props.field.suggestion)]
})
const suggestedLabel = computed(() => {
  if (recommendedValues.value.length === 0) {
    return ''
  }

  return recommendedValues.value
    .map(value => props.field.options?.find(option => String(option.value) === value)?.label || value)
    .join('、')
})

watch(() => props.modelValue, value => {
  const hasPresetValue = props.field.options?.some(option => option.value === value)
  if (props.field.allowOther && value && !hasPresetValue && value !== OTHER_VALUE) {
    isOtherSelected.value = true
    otherValue.value = String(value)
    return
  }
  if (value === OTHER_VALUE) {
    isOtherSelected.value = true
    return
  }
  isOtherSelected.value = false
  otherValue.value = ''
}, { immediate: true })

function onChange(value: string | number) {
  if (value === OTHER_VALUE) {
    isOtherSelected.value = true
    emit('update:modelValue', otherValue.value || OTHER_VALUE)
    return
  }
  isOtherSelected.value = false
  otherValue.value = ''
  emit('update:modelValue', value)
}

function onOtherInput(event: Event) {
  const target = event.target as HTMLInputElement
  otherValue.value = target.value
  emit('update:modelValue', target.value)
}

function isSuggestedOption(value: string | number): boolean {
  return recommendedValues.value.includes(String(value))
}

function getOptionReason(value: string | number): string {
  return optionReasons.value[String(value)] || ''
}
</script>

<template>
  <div
    class="form-field radio-field"
    :class="{ 'radio-field--dark': isDarkTheme }"
  >
    <label class="field-label">
      {{ field.label }}
      <span
        v-if="field.required"
        class="required-mark"
      >*</span>
    </label>
    <div
      v-if="suggestedLabel || field.suggestionReason"
      class="field-recommendation"
    >
      <span class="field-recommendation__eyebrow">AI 建议</span>
      <strong
        v-if="suggestedLabel"
        class="field-recommendation__value"
      >{{ suggestedLabel }}</strong>
      <span
        v-if="field.suggestionReason"
        class="field-recommendation__reason"
      >
        {{ field.suggestionReason }}
      </span>
    </div>
    <div class="radio-group">
      <label
        v-for="option in field.options"
        :key="option.value"
        class="radio-label"
        :class="{ 'radio-label--selected': modelValue === option.value }"
      >
        <input
          type="radio"
          :name="inputId"
          :value="option.value"
          :checked="modelValue === option.value"
          :disabled="disabled"
          class="radio"
          @change="onChange(option.value)"
        >
        <span class="radio-label__content">
          <span class="radio-label__header">
            <span class="label-text">{{ option.label }}</span>
            <span
              v-if="isSuggestedOption(option.value)"
              class="option-badge"
            >推荐</span>
          </span>
          <span
            v-if="getOptionReason(option.value)"
            class="option-reason"
          >
            {{ getOptionReason(option.value) }}
          </span>
        </span>
      </label>
      <label
        v-if="field.allowOther && !hasExplicitOtherOption"
        class="radio-label"
        :class="{ 'radio-label--selected': isOtherSelected }"
      >
        <input
          type="radio"
          :name="inputId"
          :value="OTHER_VALUE"
          :checked="isOtherSelected"
          :disabled="disabled"
          class="radio"
          @change="onChange(OTHER_VALUE)"
        >
        <span class="radio-label__content">
          <span class="radio-label__header">
            <span class="label-text">{{ field.otherLabel || '其他' }}</span>
            <span
              v-if="isSuggestedOption(OTHER_VALUE)"
              class="option-badge"
            >推荐</span>
          </span>
        </span>
      </label>
    </div>
    <input
      v-if="field.allowOther && isOtherSelected"
      type="text"
      class="other-input"
      :value="otherValue"
      :disabled="disabled"
      :placeholder="`请输入${field.label}`"
      @input="onOtherInput"
    >
    <span
      v-if="error"
      class="error-message"
    >{{ error }}</span>
  </div>
</template>

<style scoped>
.form-field {
  margin-bottom: 1rem;
}

.field-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-color);
}

.required-mark {
  color: var(--error-color, #ef4444);
  margin-left: 0.25rem;
}

.field-recommendation {
  margin-bottom: 0.42rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.16rem 0.42rem;
  padding: 0.38rem 0.52rem;
  border-radius: 0.7rem;
  border: 1px solid color-mix(in srgb, var(--form-accent, #4f46e5) 16%, #cbd5e1);
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.94), rgba(236, 254, 255, 0.72));
}

.field-recommendation__eyebrow {
  display: inline-flex;
  color: color-mix(in srgb, var(--form-accent, #4f46e5) 74%, #1d4ed8);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.field-recommendation__value {
  display: inline-flex;
  color: #0f172a;
  font-size: 0.74rem;
  font-weight: 600;
}

.field-recommendation__reason {
  margin: 0;
  color: #475569;
  font-size: 0.68rem;
  line-height: 1.4;
}

.radio-group {
  display: grid;
  gap: 0.45rem;
}

.radio-label {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.55rem 0.7rem;
  border: 1px solid color-mix(in srgb, var(--form-accent, #4f46e5) 22%, #d3dce8);
  border-radius: 0.75rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.92));
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.radio-label:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--form-accent, #4f46e5) 48%, #6366f1);
}

.radio-label--selected {
  border-color: color-mix(in srgb, var(--form-accent, #4f46e5) 72%, #4338ca);
  background: linear-gradient(135deg, rgba(224, 231, 255, 0.82), rgba(236, 254, 255, 0.78));
  box-shadow: 0 8px 20px rgba(79, 70, 229, 0.08);
}

.radio {
  width: 1rem;
  height: 1rem;
  margin-top: 0.1rem;
  cursor: pointer;
  accent-color: var(--primary-color, #3b82f6);
}

.radio-label__content {
  min-width: 0;
  flex: 1;
}

.radio-label__header {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.label-text {
  color: var(--text-color);
  font-size: 0.82rem;
  font-weight: 600;
}

.option-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.38rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--form-accent, #4f46e5) 14%, #ffffff);
  color: color-mix(in srgb, var(--form-accent, #4f46e5) 82%, #1d4ed8);
  font-size: 0.62rem;
  font-weight: 700;
}

.option-reason {
  display: block;
  margin-top: 0.2rem;
  color: #64748b;
  font-size: 0.72rem;
  line-height: 1.45;
}

.other-input {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 0.375rem;
  background-color: var(--input-bg, #fff);
  color: var(--text-color);
}

.error-message {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--error-color, #ef4444);
}

.radio-field--dark .field-recommendation {
  border-color: rgba(71, 85, 105, 0.68) !important;
  background: linear-gradient(135deg, rgba(30, 64, 175, 0.18), rgba(8, 145, 178, 0.14)) !important;
}

.radio-field--dark .field-recommendation__value,
.radio-field--dark .field-label,
.radio-field--dark .label-text {
  color: #e2e8f0 !important;
}

.radio-field--dark .field-recommendation__reason,
.radio-field--dark .option-reason {
  color: #94a3b8 !important;
}

.radio-field--dark .radio-label,
.radio-field--dark .other-input {
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.92), rgba(15, 23, 42, 0.92)) !important;
  border-color: rgba(71, 85, 105, 0.76) !important;
}

.radio-field--dark .radio-label--selected {
  background: linear-gradient(135deg, rgba(30, 64, 175, 0.34), rgba(8, 145, 178, 0.26)) !important;
  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.24) !important;
}

:global([data-theme='dark']) .field-recommendation,
:global(.dark) .field-recommendation {
  border-color: rgba(71, 85, 105, 0.68);
  background: linear-gradient(135deg, rgba(30, 64, 175, 0.18), rgba(8, 145, 178, 0.14));
}

:global([data-theme='dark']) .field-recommendation__value,
:global(.dark) .field-recommendation__value {
  color: #e2e8f0;
}

:global([data-theme='dark']) .field-recommendation__reason,
:global(.dark) .field-recommendation__reason,
:global([data-theme='dark']) .option-reason,
:global(.dark) .option-reason {
  color: #94a3b8;
}

:global([data-theme='dark']) .radio-label,
:global(.dark) .radio-label,
:global([data-theme='dark']) .other-input,
:global(.dark) .other-input {
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.92), rgba(15, 23, 42, 0.92));
  border-color: rgba(71, 85, 105, 0.76);
}

:global([data-theme='dark']) .radio-label--selected,
:global(.dark) .radio-label--selected {
  background: linear-gradient(135deg, rgba(30, 64, 175, 0.34), rgba(8, 145, 178, 0.26));
  box-shadow: 0 10px 22px rgba(2, 6, 23, 0.24);
}

:global([data-theme='dark']) .label-text,
:global(.dark) .label-text {
  color: #e2e8f0;
}
</style>
