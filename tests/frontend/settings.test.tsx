// FILE: tests/frontend/settings.test.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-SETTINGS persistence controls, fixed GPU device display, output settings, and HF-token IPC handling.
//   SCOPE: jsdom React tests with fake Electron bridge; no backend, filesystem, or raw token persistence access.
//   DEPENDS: src/components/settings, src/stores, @testing-library/react
//   LINKS: M-SETTINGS, V-M-SETTINGS, M-CONFIG-STORE
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createConfig - stable AppConfig fixture for persisted settings tests.
//   createElectronApi - fake Electron invoke bridge for config/token/dialog IPC.
//   describe(M-SETTINGS) - persistence, GPU-only display, output formats, and token safety checks.
// END_MODULE_MAP
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SettingsView } from '../../src/components/settings'
import { i18n } from '../../src/i18n'
import { resetAllStoresForTests, useSettingsStore } from '../../src/stores'
import type { AppConfig, ElectronApi, IpcChannel, IpcRequestMap, IpcResponseMap } from '../../src/shared'

// START_CONTRACT: createConfig
//   PURPOSE: Build a stable persisted AppConfig fixture for settings tests.
//   INPUTS: { patch?: Partial<AppConfig> - optional fixture overrides }
//   OUTPUTS: AppConfig - complete renderer config without raw HF token
//   SIDE_EFFECTS: none
//   LINKS: M-SETTINGS, V-M-SETTINGS, M-SHARED
// END_CONTRACT: createConfig
function createConfig(patch: Partial<AppConfig> = {}): AppConfig {
  return {
    language: 'ru',
    theme: 'system',
    model: 'faster-whisper-large-v3',
    numSpeakers: null,
    outputFolder: 'H:/out',
    outputFormats: ['json', 'txt'],
    watchFolder: null,
    watchEnabled: false,
    cronExpression: '0 * * * *',
    preferredPort: null,
    firstRun: true,
    hasHfToken: false,
    ...patch
  }
}

function createElectronApi(config = createConfig()) {
  let storedConfig = config
  let hasToken = config.hasHfToken
  const invoke = vi.fn(async function invoke<TChannel extends IpcChannel>(
    channel: TChannel,
    request: IpcRequestMap[TChannel]
  ) {
    if (channel === 'config:get') {
      return storedConfig as IpcResponseMap[TChannel]
    }

    if (channel === 'config:set') {
      storedConfig = { ...storedConfig, ...(request as Partial<AppConfig>) }
      return storedConfig as IpcResponseMap[TChannel]
    }

    if (channel === 'config:get-hf-token-status') {
      return hasToken as IpcResponseMap[TChannel]
    }

    if (channel === 'config:set-hf-token') {
      hasToken = true
      storedConfig = { ...storedConfig, hasHfToken: true }
      return { ok: true } as IpcResponseMap[TChannel]
    }

    if (channel === 'config:clear-hf-token') {
      hasToken = false
      storedConfig = { ...storedConfig, hasHfToken: false }
      return { ok: true } as IpcResponseMap[TChannel]
    }

    if (channel === 'dialog:select-folder') {
      return 'H:/selected-output' as IpcResponseMap[TChannel]
    }

    throw new Error(`Unexpected channel: ${channel}`)
  })

  return { invoke } as Pick<ElectronApi, 'invoke'> & { invoke: typeof invoke }
}

describe('M-SETTINGS contracts', () => {
  beforeEach(async () => {
    resetAllStoresForTests()
    await i18n.changeLanguage('ru')
  })

  it('loads persisted settings and keeps device displayed as fixed GPU CUDA', async () => {
    const electronApi = createElectronApi(createConfig({ model: 'faster-whisper-medium', outputFolder: 'H:/persisted' }))

    render(<SettingsView electronApi={electronApi} />)

    expect(await screen.findByDisplayValue('faster-whisper-medium')).toBeTruthy()
    expect(screen.getByDisplayValue('H:/persisted')).toBeTruthy()
    expect(screen.getByText('GPU CUDA')).toBeTruthy()
    expect(screen.getByText('Фиксировано контрактом проекта')).toBeTruthy()
    expect(useSettingsStore.getState().device).toBe('cuda')
  })

  it('persists model and output format changes through config:set', async () => {
    const electronApi = createElectronApi()

    render(<SettingsView electronApi={electronApi} />)
    await screen.findByDisplayValue('faster-whisper-large-v3')

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Модель'), { target: { value: 'faster-whisper-large-v3-turbo' } })
    })
    await waitFor(() => expect(electronApi.invoke).toHaveBeenCalledWith('config:set', { model: 'faster-whisper-large-v3-turbo' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'SRT format' }))
    })
    await waitFor(() => expect(electronApi.invoke).toHaveBeenCalledWith('config:set', expect.objectContaining({ outputFormats: expect.arrayContaining(['srt']) })))
    expect(useSettingsStore.getState().device).toBe('cuda')
  })

  it('stores only HF-token presence in renderer state while sending token through IPC', async () => {
    const electronApi = createElectronApi()

    render(<SettingsView electronApi={electronApi} />)
    await screen.findByText('Токен ещё не сохранён')

    fireEvent.change(screen.getByLabelText('HuggingFace токен'), { target: { value: 'hf_secret_token' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить токен' }))

    expect(await screen.findByText('HF-токен сохранён')).toBeTruthy()
    expect(electronApi.invoke).toHaveBeenCalledWith('config:set-hf-token', { token: 'hf_secret_token' })
    expect(useSettingsStore.getState().hasHfToken).toBe(true)
    expect(JSON.stringify(useSettingsStore.getState())).not.toContain('hf_secret_token')
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Added module-local tests for settings persistence, GPU-only display, and HF-token IPC safety.
// END_CHANGE_SUMMARY
