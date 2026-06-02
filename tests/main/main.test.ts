// FILE: tests/main/main.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Test Electron main bootstrap: window creation, manager initialization, graceful shutdown.
//   SCOPE: Mocked electron app/BrowserWindow and module dependencies for deterministic Vitest tests.
//   DEPENDS: electron/main, vitest
//   LINKS: M-MAIN, V-M-MAIN
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   describe(M-MAIN) - bootstrap creates window, before-quit stops backend.
// END_MODULE_MAP
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const {
  mockGetConfig,
  mockRegisterIpc,
  mockStartBackend,
  mockStopBackend,
  mockWhenReady,
  mockAppOn,
  mockAppQuit,
  mockWindowOnce
} = vi.hoisted(() => ({
  mockGetConfig: vi.fn(() => ({
    language: 'ru',
    preferredPort: null,
    outputFolder: 'H:/output',
    firstRun: false
  })),
  mockRegisterIpc: vi.fn(),
  mockStartBackend: vi.fn().mockResolvedValue({ baseUrl: 'http://127.0.0.1:18777', running: true }),
  mockStopBackend: vi.fn().mockResolvedValue(undefined),
  mockWhenReady: vi.fn().mockResolvedValue(undefined),
  mockAppOn: vi.fn(),
  mockAppQuit: vi.fn(),
  mockWindowOnce: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    whenReady: mockWhenReady,
    on: mockAppOn,
    quit: mockAppQuit
  },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    show: vi.fn(),
    on: vi.fn(),
    once: mockWindowOnce,
    close: vi.fn()
  }))
}))

vi.mock('../../electron/config-store', () => ({
  getConfig: mockGetConfig
}))

vi.mock('../../electron/ipc-handlers', () => ({
  registerIpc: mockRegisterIpc
}))

vi.mock('../../electron/python-manager', () => ({
  start: mockStartBackend,
  stop: mockStopBackend
}))

await import('../../electron/main')

describe('M-MAIN', () => {
  beforeEach(() => {
    mockWhenReady.mockResolvedValue(undefined)
  })

  it('bootstrap creates frameless window and initialises managers on app ready', () => {
    expect(mockWhenReady).toHaveBeenCalled()
    expect(mockGetConfig).toHaveBeenCalled()
    expect(mockStartBackend).toHaveBeenCalled()
    expect(mockRegisterIpc).toHaveBeenCalled()
    expect(mockAppOn).toHaveBeenCalledWith('activate', expect.any(Function))
  })

  it('registers before-quit handler for graceful backend shutdown', async () => {
    const found = mockAppOn.mock.calls.find((args: string[]) => args[0] === 'before-quit')
    expect(found).toBeDefined()
    const handler = found![1] as () => Promise<void>
    await handler()
    expect(mockStopBackend).toHaveBeenCalled()
  })

  it('registers window-all-closed handler', () => {
    const found = mockAppOn.mock.calls.find((args: string[]) => args[0] === 'window-all-closed')
    expect(found).toBeDefined()
  })
})
