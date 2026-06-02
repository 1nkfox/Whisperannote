// FILE: src/lib/api.ts
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Provide authenticated backend HTTP calls and a reconnecting progress WebSocket hook for the renderer.
//   SCOPE: Browser fetch/WebSocket integration, queue resync into stores, and typed API errors; no Electron IPC persistence.
//   DEPENDS: src/shared, src/stores, React
//   LINKS: M-API-CLIENT, V-M-API-CLIENT, M-STORES, M-SHARED, M-SERVER
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ApiClientError - typed frontend API error with UNAUTHORIZED/NETWORK codes.
//   createApiClient / api - authenticated HTTP methods for backend endpoints including queue enqueue and model download.
//   useWebSocket - progress WebSocket hook with reconnect and queue resubscribe.
// END_MODULE_MAP
import { useEffect, useRef, useState } from 'react'

import type { AvailableModels, HealthStatus, TaskInfo, TranscriptionResult, WSMessage } from '../shared'
import { useBackendStore, useTranscriptionStore } from '../stores'

export type ApiErrorCode = 'UNAUTHORIZED' | 'NETWORK'

export class ApiClientError extends Error {
  readonly code: ApiErrorCode
  readonly status: number | null

  constructor(code: ApiErrorCode, message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
  }
}

export type ApiClientOptions = {
  baseUrl: string
  wsBaseUrl?: string
  token: string
  fetchImpl?: typeof fetch
  WebSocketImpl?: typeof WebSocket
  reconnectMs?: number
}

export type TranscribeUploadRequest = {
  file: File
  model: string
  language?: string
  numSpeakers?: number | null
}

export type QueueFileRequest = {
  filePath: string
  outputDir?: string
  model?: string
  language?: string
  numSpeakers?: number | null
  outputFormats?: string[]
  speakerNames?: Record<string, string>
}

export type ApiClient = {
  health: () => Promise<HealthStatus>
  models: () => Promise<AvailableModels>
  downloadModel: (model: string) => Promise<{ status: string; model: string }>
  transcribe: (request: TranscribeUploadRequest) => Promise<TaskInfo>
  enqueueFile: (request: QueueFileRequest) => Promise<TaskInfo>
  queueStatus: () => Promise<TaskInfo[]>
  cancelTask: (taskId: string) => Promise<void>
  getResult: (taskId: string) => Promise<TranscriptionResult | null>
}

export type UseWebSocketOptions = {
  taskId: string | null
  client: Pick<ApiClient, 'queueStatus'>
  wsBaseUrl: string
  token: string
  WebSocketImpl?: typeof WebSocket
  reconnectMs?: number
}

export type WebSocketState = {
  connected: boolean
  lastMessage: WSMessage | null
  error: string | null
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function encodeQuery(value: string): string {
  return encodeURIComponent(value)
}

// START_CONTRACT: createApiClient
//   PURPOSE: Create typed backend HTTP methods that always send Authorization: Bearer without exposing secrets in logs.
//   INPUTS: { options: ApiClientOptions - base URLs, token, and optional test doubles }
//   OUTPUTS: ApiClient - backend request facade
//   SIDE_EFFECTS: network requests through fetchImpl
//   LINKS: M-API-CLIENT, V-M-API-CLIENT, M-STORES, M-SHARED
// END_CONTRACT: createApiClient
export function createApiClient(options: ApiClientOptions): ApiClient {
  const baseUrl = trimSlash(options.baseUrl)
  const fetchImpl = options.fetchImpl ?? fetch

  async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    // START_BLOCK_AUTH_REQUEST
    let response: Response

    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${options.token}`,
          ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...init.headers
        }
      })
    } catch (error) {
      throw new ApiClientError('NETWORK', error instanceof Error ? error.message : 'Network request failed')
    }

    if (response.status === 401 || response.status === 403) {
      throw new ApiClientError('UNAUTHORIZED', 'Backend authorization failed', response.status)
    }

    if (!response.ok) {
      throw new ApiClientError('NETWORK', `Backend request failed with ${response.status}`, response.status)
    }

    return (await response.json()) as T
    // END_BLOCK_AUTH_REQUEST
  }

  return {
    health: () => requestJson<HealthStatus>('/api/health'),
    models: () => requestJson<AvailableModels>('/api/models'),
    downloadModel: (model) => requestJson<{ status: string; model: string }>('/api/models/download', {
      method: 'POST',
      body: JSON.stringify({ model })
    }),
    transcribe: (request) => {
      const form = new FormData()
      form.append('file', request.file)
      form.append('model', request.model)
      form.append('language', request.language ?? 'ru')

      if (request.numSpeakers !== null && request.numSpeakers !== undefined) {
        form.append('num_speakers', String(request.numSpeakers))
      }

      return requestJson<TaskInfo>('/api/transcribe', { method: 'POST', body: form })
    },
    enqueueFile: (request) => {
      return requestJson<TaskInfo>('/api/queue', {
        method: 'POST',
        body: JSON.stringify({
          file_path: request.filePath,
          output_dir: request.outputDir ?? '',
          model: request.model ?? 'faster-whisper-large-v3',
          language: request.language ?? 'ru',
          num_speakers: request.numSpeakers ?? null,
          output_formats: request.outputFormats ?? ['json', 'txt', 'srt'],
          speaker_names: request.speakerNames ?? {}
        })
      })
    },
    queueStatus: () => requestJson<TaskInfo[]>('/api/queue/status'),
    cancelTask: async (taskId) => {
      await requestJson<{ status: string; task_id: string }>(`/api/queue/${encodeQuery(taskId)}`, { method: 'DELETE' })
    },
    getResult: async (taskId) => {
      const tasks = await requestJson<TaskInfo[]>('/api/queue/status')
      return tasks.find((task) => task.task_id === taskId)?.result ?? null
    }
  }
}

export const api = {
  create: createApiClient
}

function buildProgressUrl(wsBaseUrl: string, taskId: string, token: string): string {
  return `${trimSlash(wsBaseUrl)}/ws/progress/${encodeQuery(taskId)}?token=${encodeQuery(token)}`
}

function applyTaskResync(tasks: TaskInfo[]): void {
  const transcriptionStore = useTranscriptionStore.getState()

  for (const task of tasks) {
    transcriptionStore.upsertTask(task)

    if (task.result) {
      transcriptionStore.setTaskResult(task.task_id, task.result)
    }
  }
}

// START_CONTRACT: useWebSocket
//   PURPOSE: Subscribe to task progress and reconnect after transient disconnects while resyncing queue status.
//   INPUTS: { options: UseWebSocketOptions - task id, client, websocket base URL, token, and test doubles }
//   OUTPUTS: WebSocketState - connection status, last progress message, and last error
//   SIDE_EFFECTS: opens browser WebSocket, updates M-STORES queue/result/backend error state
//   LINKS: M-API-CLIENT, V-M-API-CLIENT, M-STORES, M-SHARED
// END_CONTRACT: useWebSocket
export function useWebSocket(options: UseWebSocketOptions): WebSocketState {
  const { taskId, client, wsBaseUrl, token, WebSocketImpl = WebSocket, reconnectMs = 1000 } = options
  const [state, setState] = useState<WebSocketState>({ connected: false, lastMessage: null, error: null })
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!taskId || !token) {
      setState({ connected: false, lastMessage: null, error: null })
      return undefined
    }

    let disposed = false

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const connect = () => {
      clearReconnectTimer()
      const socket = new WebSocketImpl(buildProgressUrl(wsBaseUrl, taskId, token))
      wsRef.current = socket

      socket.onopen = () => {
        setState((current) => ({ ...current, connected: true, error: null }))
      }

      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as WSMessage
        setState((current) => ({ ...current, lastMessage: message }))
      }

      socket.onerror = () => {
        useBackendStore.getState().setLastError('WebSocket progress connection failed')
        setState((current) => ({ ...current, error: 'WebSocket progress connection failed' }))
      }

      socket.onclose = () => {
        setState((current) => ({ ...current, connected: false }))

        if (disposed) {
          return
        }

        // START_BLOCK_WS_RECONNECT
        console.info('[ApiClient][useWebSocket][BLOCK_WS_RECONNECT] reconnecting progress socket', {
          task_id: taskId,
          stage: 'resubscribe'
        })
        void client
          .queueStatus()
          .then(applyTaskResync)
          .catch((error: unknown) => {
            useBackendStore
              .getState()
              .setLastError(error instanceof Error ? error.message : 'Failed to resync queue status')
          })
        reconnectTimerRef.current = setTimeout(connect, reconnectMs)
        // END_BLOCK_WS_RECONNECT
      }
    }

    connect()

    return () => {
      disposed = true
      clearReconnectTimer()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [WebSocketImpl, client, reconnectMs, taskId, token, wsBaseUrl])

  return state
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - Added model download API for Phase-6 onboarding progress.
// END_CHANGE_SUMMARY
