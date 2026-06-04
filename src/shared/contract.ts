// FILE: src/shared/contract.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Define shared IPC channels, payloads, app config, backend info, and main-to-renderer events.
//   SCOPE: Type-only cross-process contract imported by electron/ and src/ modules.
//   DEPENDS: src/shared/dto.ts
//   LINKS: M-SHARED, V-M-SHARED, M-PRELOAD, M-IPC, M-CONFIG-STORE, M-API-CLIENT, M-STORES
//   ROLE: TYPES
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   IPC_CHANNELS - as const whitelist of invoke channels including safe window controls.
//   IPC_EVENTS - as const whitelist of main-to-renderer events.
//   AppConfig - persisted app settings without raw HF token.
//   BackendInfo / BackendStatus - local backend connection metadata.
//   IpcRequestMap / IpcResponseMap - typed invoke request and response map.
//   MainToRendererEventMap - typed event payload map.
// END_MODULE_MAP

import type { AvailableModels, HealthStatus, TaskInfo, TranscribeJob } from './dto'

export type AppLanguage = 'ru' | 'en'
export type AppTheme = 'light' | 'dark' | 'system'
export type WhisperModel =
  | 'faster-whisper-large-v3'
  | 'faster-whisper-large-v3-turbo'
  | 'faster-whisper-medium'
export type OutputFormat = 'json' | 'txt' | 'srt' | 'docx'

export type AppConfig = {
  language: AppLanguage
  theme: AppTheme
  model: WhisperModel
  numSpeakers: number | null
  outputFolder: string
  outputFormats: OutputFormat[]
  watchFolder: string | null
  watchEnabled: boolean
  cronExpression: string
  preferredPort: number | null
  firstRun: boolean
  hasHfToken: boolean
}

export type BackendInfo = {
  baseUrl: string
  wsBaseUrl: string
  token: string
  port: number
  running: boolean
}

export type BackendStatus = {
  running: boolean
  healthy: boolean
  port: number | null
}

export type WatcherStatus = {
  watching: boolean
  folder?: string
}

export type OkResponse = { ok: true }

export type DialogSelectFileRequest = {
  filters?: Array<{ name: string; extensions: string[] }>
}

export const IPC_CHANNELS = [
  'dialog:select-file',
  'dialog:select-folder',
  'config:get',
  'config:set',
  'config:get-hf-token-status',
  'config:set-hf-token',
  'config:clear-hf-token',
  'backend:get-info',
  'backend:get-status',
  'backend:restart',
  'watcher:start',
  'watcher:stop',
  'watcher:get-status',
  'shell:open-path',
  'window:minimize',
  'window:close'
] as const

export type IpcChannel = (typeof IPC_CHANNELS)[number]

export const IPC_EVENTS = ['watcher:new-file', 'backend:status', 'backend:log'] as const

export type IpcEvent = (typeof IPC_EVENTS)[number]

export type IpcRequestMap = {
  'dialog:select-file': DialogSelectFileRequest | undefined
  'dialog:select-folder': undefined
  'config:get': undefined
  'config:set': Partial<AppConfig>
  'config:get-hf-token-status': undefined
  'config:set-hf-token': { token: string }
  'config:clear-hf-token': undefined
  'backend:get-info': undefined
  'backend:get-status': undefined
  'backend:restart': undefined
  'watcher:start': { folder: string; cron?: string }
  'watcher:stop': undefined
  'watcher:get-status': undefined
  'shell:open-path': { path: string }
  'window:minimize': undefined
  'window:close': undefined
}

export type IpcResponseMap = {
  'dialog:select-file': string | null
  'dialog:select-folder': string | null
  'config:get': AppConfig
  'config:set': AppConfig
  'config:get-hf-token-status': boolean
  'config:set-hf-token': OkResponse
  'config:clear-hf-token': OkResponse
  'backend:get-info': BackendInfo
  'backend:get-status': BackendStatus
  'backend:restart': OkResponse
  'watcher:start': OkResponse
  'watcher:stop': OkResponse
  'watcher:get-status': WatcherStatus
  'shell:open-path': OkResponse
  'window:minimize': OkResponse
  'window:close': OkResponse
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Added safe frameless-window controls for renderer minimize/close buttons.
// END_CHANGE_SUMMARY

export type MainToRendererEventMap = {
  'watcher:new-file': { filePath: string; fileName: string }
  'backend:status': BackendStatus
  'backend:log': { line: string }
}

export type BackendApi = {
  health: HealthStatus
  models: AvailableModels
  task: TaskInfo
  transcribe: TranscribeJob
}

export type ElectronApi = {
  invoke<TChannel extends IpcChannel>(
    channel: TChannel,
    request: IpcRequestMap[TChannel]
  ): Promise<IpcResponseMap[TChannel]>
  on<TEvent extends IpcEvent>(
    event: TEvent,
    listener: (payload: MainToRendererEventMap[TEvent]) => void
  ): () => void
}
