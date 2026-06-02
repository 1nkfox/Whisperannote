// FILE: tests/frontend/onboarding.test.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-ONBOARDING CUDA/FFmpeg error display, model download progress, HF-token handling, and first-run completion.
//   SCOPE: jsdom React tests with fake API client, fake Electron bridge, and fake WebSocket; no backend, network, or model downloads.
//   DEPENDS: src/components/onboarding, src/stores, src/lib/api, @testing-library/react
//   LINKS: M-ONBOARDING, V-M-ONBOARDING, M-API-CLIENT, M-STORES
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createHealth - stable HealthStatus fixture for readiness checks.
//   createElectronApi - fake config/token IPC bridge.
//   FakeWebSocket - controllable model progress socket test double.
//   describe(M-ONBOARDING) - environment errors, WS progress, token, and completion checks.
// END_MODULE_MAP
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FirstRunWizard } from '../../src/components/onboarding'
import { resetAllStoresForTests, useBackendStore, useSettingsStore } from '../../src/stores'
import type { AppConfig, ElectronApi, HealthStatus, IpcChannel, IpcRequestMap, IpcResponseMap } from '../../src/shared'

function createHealth(patch: Partial<HealthStatus> = {}): HealthStatus {
  return {
    status: 'ok',
    python_version: '3.11',
    cuda_available: true,
    cuda_devices: 1,
    whisper_ready: false,
    pyannote_ready: false,
    models_cached: [],
    ...patch
  }
}

function createElectronApi(initialHasToken = false) {
  let hasToken = initialHasToken
  const invoke = vi.fn(async function invoke<TChannel extends IpcChannel>(
    channel: TChannel,
    request: IpcRequestMap[TChannel]
  ) {
    if (channel === 'config:get-hf-token-status') {
      return hasToken as IpcResponseMap[TChannel]
    }

    if (channel === 'config:set-hf-token') {
      hasToken = true
      return { ok: true } as IpcResponseMap[TChannel]
    }

    if (channel === 'config:set') {
      return {
        language: 'ru',
        theme: 'system',
        model: 'faster-whisper-large-v3',
        numSpeakers: null,
        outputFolder: '',
        outputFormats: ['json', 'txt'],
        watchFolder: null,
        watchEnabled: false,
        cronExpression: '0 * * * *',
        preferredPort: null,
        firstRun: (request as Partial<AppConfig>).firstRun ?? true,
        hasHfToken: hasToken
      } as IpcResponseMap[TChannel]
    }

    throw new Error(`Unexpected channel: ${channel}`)
  })

  return { invoke } as Pick<ElectronApi, 'invoke'> & { invoke: typeof invoke }
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

describe('M-ONBOARDING contracts', () => {
  beforeEach(() => {
    resetAllStoresForTests()
    FakeWebSocket.instances.length = 0
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  it('shows clear errors when CUDA or FFmpeg are unavailable and logs the health marker', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const client = {
      health: vi.fn(async () => createHealth({ cuda_available: false, cuda_devices: 0, status: 'ffmpeg_missing' })),
      models: vi.fn(async () => ({ available: ['faster-whisper-large-v3'], downloaded: [], current: 'faster-whisper-large-v3' })),
      downloadModel: vi.fn(async () => ({ status: 'completed', model: 'faster-whisper-large-v3' })),
      queueStatus: vi.fn(async () => [])
    }

    try {
      render(<FirstRunWizard client={client} electronApi={createElectronApi()} backendInfo={{ wsBaseUrl: 'ws://127.0.0.1:8777', token: 'secret' }} />)
      fireEvent.click(screen.getByRole('button', { name: 'Проверить окружение' }))

      expect(await screen.findByText('CUDA GPU недоступен. CPU-режим не поддерживается.')).toBeTruthy()
      expect(screen.getAllByText('FFmpeg не найден.').length).toBeGreaterThanOrEqual(1)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Onboarding][checkHealth][BLOCK_CHECK_ENV] checking backend environment',
        expect.objectContaining({ stage: 'health-check', task_id: 'first-run' })
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('displays model download progress from the model WebSocket channel', async () => {
    let resolveDownload: ((value: { status: string; model: string }) => void) | null = null
    const client = {
      health: vi.fn(async () => createHealth()),
      models: vi.fn(async () => ({ available: ['faster-whisper-large-v3'], downloaded: [], current: 'faster-whisper-large-v3' })),
      downloadModel: vi.fn(() => new Promise<{ status: string; model: string }>((resolve) => {
        resolveDownload = resolve
      })),
      queueStatus: vi.fn(async () => [])
    }
    const electronApi = createElectronApi()

    render(<FirstRunWizard client={client} electronApi={electronApi} backendInfo={{ wsBaseUrl: 'ws://127.0.0.1:8777', token: 'secret' }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Проверить окружение' }))
    await screen.findByText('Модель ещё не загружена')
    fireEvent.change(screen.getByLabelText('HuggingFace токен'), { target: { value: 'hf_token' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить токен' }))
    await screen.findByText('HF-токен сохранён')

    fireEvent.click(screen.getByRole('button', { name: 'Загрузить модель' }))
    await waitFor(() => expect(FakeWebSocket.instances[0]?.url).toBe('ws://127.0.0.1:8777/ws/progress/model%3Afaster-whisper-large-v3?token=secret'))

    act(() => {
      FakeWebSocket.instances[0]?.onmessage?.({ data: JSON.stringify({ type: 'progress', percent: 42, message: '42%' }) } as MessageEvent<string>)
    })

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42')
    await act(async () => {
      resolveDownload?.({ status: 'completed', model: 'faster-whisper-large-v3' })
    })
    await waitFor(() => expect(screen.getAllByText('Модели готовы').length).toBeGreaterThanOrEqual(1))
  })

  it('marks firstRun false after CUDA, token, and model readiness are satisfied', async () => {
    useSettingsStore.getState().updateSettings({ hasHfToken: true })
    const onReady = vi.fn()
    const electronApi = createElectronApi(true)
    const client = {
      health: vi.fn(async () => createHealth({ models_cached: ['faster-whisper-large-v3'] })),
      models: vi.fn(async () => ({ available: ['faster-whisper-large-v3'], downloaded: ['faster-whisper-large-v3'], current: 'faster-whisper-large-v3' })),
      downloadModel: vi.fn(async () => ({ status: 'completed', model: 'faster-whisper-large-v3' })),
      queueStatus: vi.fn(async () => [])
    }

    render(<FirstRunWizard client={client} electronApi={electronApi} backendInfo={{ wsBaseUrl: 'ws://127.0.0.1:8777', token: 'secret' }} onReady={onReady} />)
    fireEvent.click(screen.getByRole('button', { name: 'Проверить окружение' }))
    await screen.findByText('Модели готовы')
    fireEvent.click(screen.getByRole('button', { name: 'Завершить первый запуск' }))

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    expect(electronApi.invoke).toHaveBeenCalledWith('config:set', { firstRun: false })
    expect(useSettingsStore.getState().firstRun).toBe(false)
    expect(useBackendStore.getState().health?.cuda_available).toBe(true)
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Added module-local tests for environment errors, model WS progress, and first-run completion.
// END_CHANGE_SUMMARY
