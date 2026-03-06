<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { useThemeStore } from '@/stores/theme'
import { ensureMonacoSetup } from '../monaco/setup'
import type { CompletionEntry, CompletionKind, MonacoLanguageId } from '../types'

interface MonacoCodeEditorProps {
  modelValue: string
  language: MonacoLanguageId
  fontSize: number
  tabSize: number
  wordWrap: boolean
  completions?: CompletionEntry[]
  readOnly?: boolean
}

const props = withDefaults(defineProps<MonacoCodeEditorProps>(), {
  completions: () => [],
  readOnly: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'save-shortcut': []
}>()

const themeStore = useThemeStore()

const containerRef = ref<HTMLDivElement | null>(null)
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let model: monaco.editor.ITextModel | null = null
let completionProviderDisposable: monaco.IDisposable | null = null
let isSyncingFromOutside = false

const completionKindMap: Record<CompletionKind, monaco.languages.CompletionItemKind> = {
  keyword: monaco.languages.CompletionItemKind.Keyword,
  function: monaco.languages.CompletionItemKind.Function,
  snippet: monaco.languages.CompletionItemKind.Snippet,
  variable: monaco.languages.CompletionItemKind.Variable,
  class: monaco.languages.CompletionItemKind.Class,
  property: monaco.languages.CompletionItemKind.Property
}

const completionTriggerCharactersMap: Partial<Record<MonacoLanguageId, string[]>> = {
  html: ['<', '/', ' ', '"', "'", ':'],
  css: ['.', '#', ':', '-'],
  javascript: ['.', '"', "'", '/', '@'],
  typescript: ['.', '"', "'", '/', '@', ':'],
  json: ['"', ':'],
  markdown: ['#', '`', '['],
  shell: ['$', '-', '.'],
  python: ['.', '_', '@'],
  java: ['.', '@', ':'],
  rust: ['.', ':', '#'],
  yaml: [':', '-']
}

const resolveTheme = (): 'vs' | 'vs-dark' => {
  return themeStore.isDark ? 'vs-dark' : 'vs'
}

const registerCompletionProvider = (): void => {
  completionProviderDisposable?.dispose()
  completionProviderDisposable = null

  if (!props.completions.length) {
    return
  }

  completionProviderDisposable = monaco.languages.registerCompletionItemProvider(props.language, {
    triggerCharacters: completionTriggerCharactersMap[props.language],
    provideCompletionItems(textModel, position) {
      const word = textModel.getWordUntilPosition(position)
      const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)

      const suggestions: monaco.languages.CompletionItem[] = props.completions.map(item => ({
        label: item.label,
        kind: completionKindMap[item.kind ?? 'keyword'],
        insertText: item.insertText,
        detail: item.detail,
        documentation: item.documentation,
        range
      }))

      return { suggestions }
    }
  })
}

const updateEditorOptions = (): void => {
  if (!editor) {
    return
  }

  editor.updateOptions({
    fontSize: props.fontSize,
    tabSize: props.tabSize,
    wordWrap: props.wordWrap ? 'on' : 'off',
    readOnly: props.readOnly,
    minimap: { enabled: false },
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    automaticLayout: true
  })
}

onMounted(() => {
  ensureMonacoSetup()

  if (!containerRef.value) {
    return
  }

  model = monaco.editor.createModel(props.modelValue, props.language)
  monaco.editor.setModelLanguage(model, props.language)

  editor = monaco.editor.create(containerRef.value, {
    model,
    theme: resolveTheme(),
    fontSize: props.fontSize,
    tabSize: props.tabSize,
    wordWrap: props.wordWrap ? 'on' : 'off',
    minimap: { enabled: false },
    readOnly: props.readOnly,
    quickSuggestions: {
      other: true,
      comments: true,
      strings: true
    },
    suggestOnTriggerCharacters: true,
    snippetSuggestions: 'inline',
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    automaticLayout: true
  })

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    emit('save-shortcut')
  })

  editor.onDidChangeModelContent(() => {
    if (isSyncingFromOutside || !model) {
      return
    }

    emit('update:modelValue', model.getValue())
  })

  registerCompletionProvider()
})

watch(() => props.modelValue, nextValue => {
  if (!model || nextValue === model.getValue()) {
    return
  }

  isSyncingFromOutside = true
  model.pushEditOperations([], [{
    range: model.getFullModelRange(),
    text: nextValue
  }], () => null)
  isSyncingFromOutside = false
})

watch(() => props.language, nextLanguage => {
  if (!model) {
    return
  }

  monaco.editor.setModelLanguage(model, nextLanguage)
  registerCompletionProvider()
})

watch(() => props.completions, () => {
  registerCompletionProvider()
}, { deep: true })

watch(() => [props.fontSize, props.tabSize, props.wordWrap, props.readOnly], () => {
  updateEditorOptions()
})

watch(() => themeStore.isDark, () => {
  monaco.editor.setTheme(resolveTheme())
})

onUnmounted(() => {
  completionProviderDisposable?.dispose()
  completionProviderDisposable = null

  editor?.dispose()
  editor = null

  model?.dispose()
  model = null
})
</script>

<template>
  <div
    ref="containerRef"
    class="monaco-editor-wrapper"
  />
</template>

<style scoped>
.monaco-editor-wrapper {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
