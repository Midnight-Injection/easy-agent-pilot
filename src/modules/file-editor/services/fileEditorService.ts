import { invoke } from '@tauri-apps/api/core'
import type { FileContentPayload } from '../types'

export async function readProjectFile(projectPath: string, filePath: string): Promise<string> {
  return invoke<string>('read_project_file', {
    projectPath,
    filePath
  })
}

export async function writeProjectFile(payload: FileContentPayload): Promise<void> {
  await invoke('write_project_file', {
    projectPath: payload.projectPath,
    filePath: payload.filePath,
    content: payload.content
  })
}
