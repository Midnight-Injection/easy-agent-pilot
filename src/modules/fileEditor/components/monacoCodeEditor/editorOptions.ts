import type * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import type { MonacoCodeEditorProps } from './types'

/**
 * 根据编辑器当前模式生成 Monaco 配置，避免大文件模式下启用高成本能力。
 */
export function buildEditorOptions(
  props: Readonly<MonacoCodeEditorProps>
): monaco.editor.IStandaloneEditorConstructionOptions {
  const isLargeFile = props.performanceMode === 'large'

  return {
    fontSize: props.fontSize,
    tabSize: props.tabSize,
    wordWrap: props.wordWrap ? 'on' : 'off',
    readOnly: props.readOnly,
    minimap: { enabled: false },
    glyphMargin: !isLargeFile,
    lineNumbers: 'on',
    lineNumbersMinChars: 4,
    lineDecorationsWidth: 16,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    smoothScrolling: !isLargeFile,
    matchBrackets: isLargeFile ? 'never' : 'always',
    quickSuggestions: isLargeFile
      ? false
      : {
          other: true,
          comments: true,
          strings: true
        },
    suggestOnTriggerCharacters: !isLargeFile,
    snippetSuggestions: isLargeFile ? 'none' : 'inline',
    occurrencesHighlight: isLargeFile ? 'off' : 'singleFile',
    selectionHighlight: !isLargeFile,
    folding: !isLargeFile,
    foldingStrategy: 'auto',
    foldingHighlight: !isLargeFile,
    showFoldingControls: isLargeFile ? 'mouseover' : 'always',
    unfoldOnClickAfterEndOfLine: false,
    bracketPairColorization: {
      enabled: !isLargeFile
    },
    stickyScroll: {
      enabled: !isLargeFile
    },
    guides: {
      bracketPairs: !isLargeFile,
      bracketPairsHorizontal: !isLargeFile,
      highlightActiveBracketPair: !isLargeFile,
      indentation: !isLargeFile,
      highlightActiveIndentation: !isLargeFile
    }
  }
}
