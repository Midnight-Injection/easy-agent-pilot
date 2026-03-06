/**
 * File icon resolver with extensible rule registry.
 * Add or override rules via `registerFileIconRule` without touching UI components.
 */

export interface FileIconMeta {
  icon: string
  color: string
}

export interface FileIconContext {
  nodeType: string
  fileName: string
  normalizedName: string
  extension?: string
}

export interface FileIconRule {
  id: string
  priority: number
  match: (ctx: FileIconContext) => boolean
  icon: string
  color: string
}

interface RulePreset {
  id: string
  priority: number
  icon: string
  color: string
  extensions?: readonly string[]
  fileNames?: readonly string[]
  test?: (ctx: FileIconContext) => boolean
}

const DIRECTORY_ICON: FileIconMeta = {
  icon: 'folder',
  color: 'var(--color-text-secondary)'
}

const DEFAULT_FILE_ICON: FileIconMeta = {
  icon: 'file',
  color: 'var(--color-text-tertiary)'
}

const lowerSet = (values: readonly string[]): Set<string> =>
  new Set(values.map(v => v.toLowerCase()))

const inferExtensionFromName = (fileName: string): string | undefined => {
  const normalized = fileName.toLowerCase()

  if (normalized.endsWith('.d.ts')) return 'd.ts'
  if (normalized.endsWith('.d.tsx')) return 'd.tsx'

  const lastDot = normalized.lastIndexOf('.')
  if (lastDot <= 0 || lastDot >= normalized.length - 1) {
    return undefined
  }
  return normalized.slice(lastDot + 1)
}

const normalizeExtension = (extension?: string, fileName?: string): string | undefined => {
  if (extension && extension.trim().length > 0) {
    return extension.toLowerCase().replace(/^\./, '')
  }
  if (!fileName) return undefined
  return inferExtensionFromName(fileName)
}

const createRule = (preset: RulePreset): FileIconRule => {
  const extSet = preset.extensions ? lowerSet(preset.extensions) : null
  const fileNameSet = preset.fileNames ? lowerSet(preset.fileNames) : null

  return {
    id: preset.id,
    priority: preset.priority,
    icon: preset.icon,
    color: preset.color,
    match: (ctx: FileIconContext) => {
      if (preset.test?.(ctx)) return true
      if (fileNameSet && fileNameSet.has(ctx.normalizedName)) return true
      if (extSet && ctx.extension && extSet.has(ctx.extension)) return true
      return false
    }
  }
}

const BUILTIN_RULE_PRESETS: RulePreset[] = [
  {
    id: 'readme-and-docs',
    priority: 1000,
    icon: 'file-text',
    color: '#519aba',
    fileNames: ['readme', 'readme.md', 'changelog', 'changelog.md', 'changes.md', 'license', 'notice']
  },
  {
    id: 'docker-files',
    priority: 990,
    icon: 'file-code',
    color: '#2496ed',
    fileNames: ['dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'containerfile', '.dockerignore']
  },
  {
    id: 'env-files',
    priority: 985,
    icon: 'file-cog',
    color: '#e8b44c',
    test: ({ normalizedName }) => normalizedName === '.env' || normalizedName.startsWith('.env.')
  },
  {
    id: 'lock-and-config-files',
    priority: 980,
    icon: 'file-cog',
    color: '#9ca3af',
    fileNames: [
      'package.json',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      'bun.lockb',
      'tsconfig.json',
      'jsconfig.json',
      'vite.config.ts',
      'vite.config.js',
      'webpack.config.js',
      'rollup.config.js',
      '.gitignore',
      '.gitattributes',
      '.editorconfig',
      '.npmrc',
      '.prettierrc',
      '.eslintrc',
      'cargo.toml',
      'cargo.lock'
    ]
  },
  {
    id: 'typescript-family',
    priority: 920,
    icon: 'file-code',
    color: '#3178c6',
    extensions: ['ts', 'tsx', 'mts', 'cts', 'd.ts', 'd.tsx']
  },
  {
    id: 'javascript-family',
    priority: 915,
    icon: 'file-code',
    color: '#f7df1e',
    extensions: ['js', 'jsx', 'mjs', 'cjs']
  },
  {
    id: 'vue-and-web-framework',
    priority: 910,
    icon: 'file-code',
    color: '#42b883',
    extensions: ['vue', 'svelte', 'astro']
  },
  {
    id: 'python-family',
    priority: 905,
    icon: 'file-code',
    color: '#3776ab',
    extensions: ['py', 'pyi', 'ipynb']
  },
  {
    id: 'java-family',
    priority: 900,
    icon: 'file-code',
    color: '#b07219',
    extensions: ['java', 'kt', 'kts', 'groovy', 'gradle', 'scala']
  },
  {
    id: 'rust',
    priority: 895,
    icon: 'file-code',
    color: '#dea584',
    extensions: ['rs']
  },
  {
    id: 'go',
    priority: 890,
    icon: 'file-code',
    color: '#00add8',
    extensions: ['go']
  },
  {
    id: 'frontend-style',
    priority: 885,
    icon: 'file-code',
    color: '#d977d7',
    extensions: ['css', 'scss', 'sass', 'less', 'styl', 'pcss']
  },
  {
    id: 'markup-and-data',
    priority: 880,
    icon: 'file-code',
    color: '#e34c26',
    extensions: ['html', 'htm', 'xml', 'xhtml']
  },
  {
    id: 'structured-data',
    priority: 875,
    icon: 'file-cog',
    color: '#cbcb41',
    extensions: ['json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'conf', 'properties']
  },
  {
    id: 'shell-and-script',
    priority: 870,
    icon: 'file-terminal',
    color: '#4b5563',
    extensions: ['sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd']
  },
  {
    id: 'sql',
    priority: 860,
    icon: 'file-code',
    color: '#336791',
    extensions: ['sql']
  },
  {
    id: 'markdown-and-text',
    priority: 850,
    icon: 'file-text',
    color: '#519aba',
    extensions: ['md', 'mdx', 'txt', 'text', 'log', 'rst', 'adoc']
  },
  {
    id: 'spreadsheet',
    priority: 840,
    icon: 'file-spreadsheet',
    color: '#1d6f42',
    extensions: ['csv', 'tsv', 'xls', 'xlsx', 'ods']
  },
  {
    id: 'images',
    priority: 830,
    icon: 'file-image',
    color: '#a855f7',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif']
  },
  {
    id: 'videos',
    priority: 820,
    icon: 'file-video-camera',
    color: '#ef4444',
    extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv']
  },
  {
    id: 'archives',
    priority: 810,
    icon: 'file-archive',
    color: '#f59e0b',
    extensions: ['zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'bz2', 'xz']
  }
]

const BUILTIN_RULES: FileIconRule[] = BUILTIN_RULE_PRESETS.map(createRule)
const customRules: FileIconRule[] = []

const getAllRules = (): FileIconRule[] =>
  [...customRules, ...BUILTIN_RULES].sort((a, b) => b.priority - a.priority)

export const registerFileIconRule = (rule: FileIconRule): void => {
  const index = customRules.findIndex(r => r.id === rule.id)
  if (index >= 0) {
    customRules[index] = rule
    return
  }
  customRules.push(rule)
}

export const unregisterFileIconRule = (ruleId: string): void => {
  const index = customRules.findIndex(r => r.id === ruleId)
  if (index >= 0) {
    customRules.splice(index, 1)
  }
}

export const resolveFileIcon = (
  nodeType: string,
  fileName?: string,
  extension?: string
): FileIconMeta => {
  if (nodeType === 'directory') {
    return DIRECTORY_ICON
  }

  const rawName = fileName ?? ''
  const normalizedName = rawName.toLowerCase()
  const normalizedExt = normalizeExtension(extension, rawName)

  const context: FileIconContext = {
    nodeType,
    fileName: rawName,
    normalizedName,
    extension: normalizedExt
  }

  const matchedRule = getAllRules().find(rule => rule.match(context))
  if (!matchedRule) {
    return DEFAULT_FILE_ICON
  }

  return {
    icon: matchedRule.icon,
    color: matchedRule.color
  }
}
