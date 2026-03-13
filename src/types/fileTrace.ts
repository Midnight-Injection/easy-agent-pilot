export type FileEditChangeType = 'create' | 'modify' | 'delete'

export interface FileEditRange {
  startLine: number
  endLine: number
  startColumn?: number
  endColumn?: number
}

export interface FileEditPreview {
  beforeSnippet?: string
  afterSnippet?: string
  beforeContent?: string
  afterContent?: string
}

export interface FileEditTrace {
  id: string
  messageId: string
  sessionId: string
  toolCallId?: string
  filePath: string
  relativePath: string
  changeType: FileEditChangeType
  range: FileEditRange
  preview?: FileEditPreview
  hunkHeader?: string
  timestamp: string
}
