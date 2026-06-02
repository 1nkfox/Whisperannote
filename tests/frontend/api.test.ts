// FILE: tests/frontend/api.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-API-CLIENT authenticated HTTP requests and reconnect/resubscribe WebSocket behavior.
//   SCOPE: Deterministic frontend tests with fetch/WebSocket fakes; no network or backend process.
//   DEPENDS: src/lib/api, src/stores, src/shared, @testing-library/react
//   LINKS: M-API-CLIENT, V-M-API-CLIENT
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FakeWebSocket - controllable WebSocket test double.
//   createFetch - authenticated fetch test double.
//   Probe - React component that exercises useWebSocket.
//   describe(M-API-CLIENT) - auth, unauthorized, upload, reconnect, and resubscribe checks.
// END_MODULE_MAP
import { act, render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiClientError, createApiClient, useWebSocket, type ApiClient } from '../../src/lib/api'
import { resetAllStoresForTests, useBackendStore, useTranscriptionStore } from '../../src/stores'
import type { TaskInfo } from '../../src/shared'

type FetchCall = {
  url: string
  init: RequestInit
}

const fetchCalls: FetchCall[] = []

// START_CONTRACT: createTask
//   PURPOSE: Build a stable queue status fixture for API client tests.
//   INPUTS: { taskId: string - task identifier }
//   OUTPUTS: TaskInfo - backend DTO mirror fixture
//   SIDE_EFFECTS: none
//   LINKS: M-API-CLIENT, V-M-API-CLIENT, M-SHARED
// END_CONTRACT: createTask
function createTask(taskId: string): TaskInfo {
  return {
    task_id: taskId,
    file_path: 'H:/audio/meeting.wav',
    file_name: 'meeting.wav',
    status: 'queued',
    progress_percent: 0,
    queue_position: 0,
    created_at: '2026-06-02T00:00:00Z',
    error_message: null,
    result: null
  }
}

// START_CONTRACT: createFetch
//   PURPOSE: Create a fetch fake that records requests and returns queued responses.
//   INPUTS: { responses: Response[] - ordered fake responses }
//   OUTPUTS: typeof fetch - fetch-compatible test double
//   SIDE_EFFECTS: records calls in fetchCalls
//   LINKS: M-API-CLIENT, V-M-API-CLIENT
// END_CONTRACT: createFetch
function createFetch(responses: Response[]): typeof fetch {
  return vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init: init ?? {} })
    const response = responses.shift()

    if (!response) {
      throw new Error('No fake response queued')
    }

    return response
  }) as unknown as typeof fetch
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  readonly url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  close(): void {
    this.onclose?.()
  }
}

function Probe(props: { taskId: string; client: Pick<ApiClient, 'queueStatus'> }) {
  const state = useWebSocket({
    taskId: props.taskId,
    client: props.client,
    wsBaseUrl: 'ws://127.0.0.1:8777',
    token: 'secret-token',
    WebSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    reconnectMs: 1
  })

  return React.createElement('output', null, state.connected ? 'connected' : state.error ?? 'idle')
}

describe('M-API-CLIENT contracts', () => {
  beforeEach(() => {
    fetchCalls.length = 0
    FakeWebSocket.instances.length = 0
    resetAllStoresForTests()
  })

  it('sends Authorization Bearer for JSON backend requests', async () => {
    const client = createApiClient({
      baseUrl: 'http://127.0.0.1:8777/',
      token: 'secret-token',
      fetchImpl: createFetch([Response.json({ status: 'ok', python_version: '3.11', cuda_available: true })])
    })

    await client.health()

    expect(fetchCalls[0]?.url).toBe('http://127.0.0.1:8777/api/health')
    expect(fetchCalls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
  })

  it('maps unauthorized responses to ApiClientError without leaking the token', async () => {
    const client = createApiClient({
      baseUrl: 'http://127.0.0.1:8777',
      token: 'secret-token',
      fetchImpl: createFetch([new Response('{}', { status: 401 })])
    })

    try {
      await client.models()
      throw new Error('Expected unauthorized request to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError)
      expect(error).toMatchObject({ code: 'UNAUTHORIZED', status: 401 })
      expect((error as ApiClientError).message).not.toContain('secret-token')
    }
  })

  it('uploads files through multipart form data and preserves cuda-only settings outside the request', async () => {
    const task = createTask('task-1')
    const client = createApiClient({
      baseUrl: 'http://127.0.0.1:8777',
      token: 'secret-token',
      fetchImpl: createFetch([Response.json(task)])
    })

    await expect(
      client.transcribe({ file: new File(['audio'], 'meeting.wav'), model: 'faster-whisper-large-v3', numSpeakers: 2 })
    ).resolves.toEqual(task)

    expect(fetchCalls[0]?.init.method).toBe('POST')
    expect(fetchCalls[0]?.init.body).toBeInstanceOf(FormData)
    expect(fetchCalls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer secret-token' })
    expect(useBackendStore.getState().health).toBeNull()
  })

  it('reconnects the progress websocket and resubscribes by queue status', async () => {
    vi.useFakeTimers()
    let resolveQueueStatus: ((tasks: TaskInfo[]) => void) | null = null
    const queueStatus = vi.fn(
      () => new Promise<TaskInfo[]>((resolve) => {
        resolveQueueStatus = resolve
      })
    )
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    try {
      render(React.createElement(Probe, { taskId: 'task-1', client: { queueStatus } }))

      expect(FakeWebSocket.instances[0]?.url).toBe('ws://127.0.0.1:8777/ws/progress/task-1?token=secret-token')

      act(() => {
        FakeWebSocket.instances[0]?.onopen?.()
      })
      expect(screen.getByText('connected')).toBeTruthy()

      act(() => {
        FakeWebSocket.instances[0]?.onclose?.()
      })

      expect(queueStatus).toHaveBeenCalledTimes(1)

      await act(async () => {
        resolveQueueStatus?.([createTask('task-1')])
      })
      await vi.runOnlyPendingTimersAsync()

      expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(2)
      expect(useTranscriptionStore.getState().tasks['task-1']?.task_id).toBe('task-1')
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ApiClient][useWebSocket][BLOCK_WS_RECONNECT] reconnecting progress socket',
        expect.objectContaining({ task_id: 'task-1', stage: 'resubscribe' })
      )
    } finally {
      consoleSpy.mockRestore()
      vi.useRealTimers()
    }
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Added module-local tests for authenticated HTTP and WS reconnect/resubscribe behavior.
// END_CHANGE_SUMMARY
