// FILE: tests/main/ipc.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Test IPC handler registration, whitelist enforcement, and per-channel logic.
//   SCOPE: Mocked electron dialog/ipcMain/shell and config-store/python-manager for Vitest.
//   DEPENDS: electron/ipc-handlers, vitest
//   LINKS: M-IPC, V-M-IPC
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   describe(M-IPC) - registration, config, backend, dialog, unknown channels.
// END_MODULE_MAP
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const {
  mockHandle,
  mockShowOpenDialog,
  mockOpenPath,
  mockGetConfig,
  mockSetConfig,
  mockHasHfToken,
  mockSetSecretHfToken,
  mockClearHfToken,
  mockGetInfo,
  mockGetStatus,
  mockRestart
} = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockShowOpenDialog: vi.fn(),
  mockOpenPath: vi.fn(),
  mockGetConfig: vi.fn(),
  mockSetConfig: vi.fn(),
  mockHasHfToken: vi.fn(),
  mockSetSecretHfToken: vi.fn(),
  mockClearHfToken: vi.fn(),
  mockGetInfo: vi.fn(),
  mockGetStatus: vi.fn(),
  mockRestart: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle },
  dialog: { showOpenDialog: mockShowOpenDialog },
  shell: { openPath: mockOpenPath }
}))

vi.mock('../../electron/config-store', () => ({
  getConfig: mockGetConfig,
  setConfig: mockSetConfig,
  hasHfToken: mockHasHfToken,
  setSecretHfToken: mockSetSecretHfToken,
  clearHfToken: mockClearHfToken,
  getSecretHfToken: vi.fn()
}))

vi.mock('../../electron/python-manager', () => ({
  getInfo: mockGetInfo,
  getStatus: mockGetStatus,
  restart: mockRestart,
  start: vi.fn(),
  stop: vi.fn()
}))

import { registerIpc } from '../../electron/ipc-handlers'
import { IPC_CHANNELS } from '../../src/shared'

describe('M-IPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers handlers for every whitelisted channel', () => {
    registerIpc()

    expect(mockHandle).toHaveBeenCalledTimes(IPC_CHANNELS.length)
    for (const channel of IPC_CHANNELS) {
      expect(mockHandle).toHaveBeenCalledWith(channel, expect.any(Function))
    }
  })

  it('config:get handler returns config from config-store', async () => {
    registerIpc()
    mockGetConfig.mockReturnValue({ language: 'en' })

    const handler = getHandler('config:get')
    const result = await handler({}, undefined)

    expect(result).toEqual({ language: 'en' })
  })

  it('config:set handler updates config', async () => {
    registerIpc()
    mockSetConfig.mockReturnValue({ language: 'en', firstRun: false })

    const handler = getHandler('config:set')
    const result = await handler({}, { language: 'en' })

    expect(mockSetConfig).toHaveBeenCalledWith({ language: 'en' })
    expect(result).toEqual({ language: 'en', firstRun: false })
  })

  it('config:set-hf-token stores token and restarts backend', async () => {
    registerIpc('existing-token')
    mockRestart.mockResolvedValue(undefined)

    const handler = getHandler('config:set-hf-token')
    const result = await handler({}, { token: 'new-hf-token' })

    expect(mockSetSecretHfToken).toHaveBeenCalledWith('new-hf-token')
    expect(mockRestart).toHaveBeenCalledWith('new-hf-token')
    expect(result).toEqual({ ok: true })
  })

  it('backend:get-status returns running state', async () => {
    registerIpc()
    mockGetStatus.mockReturnValue({ running: true, healthy: true, port: 18777 })

    const handler = getHandler('backend:get-status')
    const result = await handler({}, undefined)

    expect(result).toEqual({ running: true, healthy: true, port: 18777 })
  })

  it('dialog:select-file opens file dialog', async () => {
    registerIpc()
    mockShowOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/test/file.wav'] })

    const handler = getHandler('dialog:select-file')
    const result = await handler({}, undefined)

    expect(mockShowOpenDialog).toHaveBeenCalled()
    expect(result).toBe('/test/file.wav')
  })

  it('shell:open-path opens path', async () => {
    registerIpc()
    mockOpenPath.mockResolvedValue('')

    const handler = getHandler('shell:open-path')
    const result = await handler({}, { path: '/output' })

    expect(mockOpenPath).toHaveBeenCalledWith('/output')
    expect(result).toEqual({ ok: true })
  })
})

function getHandler(channel: string): (...args: unknown[]) => Promise<unknown> {
  return mockHandle.mock.calls.find(([ch]) => ch === channel)?.[1] as (...args: unknown[]) => Promise<unknown>
}
