// FILE: tests/main/python-manager.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Test PythonManager: port selection, env passthrough, health polling, restart, stop.
//   SCOPE: Mocked child_process spawning and health checks for deterministic vitest tests.
//   DEPENDS: electron/python-manager, vitest
//   LINKS: M-PY-MANAGER, V-M-PY-MANAGER
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   describe(M-PY-MANAGER) - spawn, env, health poll, restart, stop scenarios.
// END_MODULE_MAP
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const {
  mockSpawn,
  mockRandomBytes,
  mockCreateServer,
  mockAccess,
  onCallbacks
} = vi.hoisted(() => {
  const callbacks: Record<string, Array<(...args: unknown[]) => void>> = {}

  const mockChildProcess = {
    pid: 12345,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!callbacks[event]) callbacks[event] = []
      callbacks[event].push(cb)
    }),
    kill: vi.fn()
  }

  const mockListenServer = (port: number) => ({
    listen: vi.fn((_p: number, _h: string, cb: () => void) => cb()),
    address: vi.fn(() => ({ port, address: '127.0.0.1', family: 'IPv4' })),
    close: vi.fn((cb: () => void) => cb()),
    on: vi.fn()
  })

  return {
    mockSpawn: vi.fn(() => mockChildProcess),
    mockRandomBytes: vi.fn(() => ({
      toString: vi.fn(() => 'mock-token-hex-value')
    })),
    mockCreateServer: vi.fn(() => mockListenServer(18777)),
    mockAccess: vi.fn(),
    onCallbacks: callbacks
  }
})

vi.mock('node:child_process', () => ({
  spawn: mockSpawn
}))

vi.mock('node:crypto', () => ({
  randomBytes: mockRandomBytes
}))

vi.mock('node:net', () => ({
  createServer: mockCreateServer
}))

vi.mock('node:fs/promises', () => ({
  access: mockAccess
}))

vi.mock('../../electron/config-store', () => ({
  getConfig: vi.fn(() => ({
    language: 'ru',
    outputFolder: 'H:/output',
    watchFolder: 'H:/watch',
    firstRun: false
  }))
}))

import { start, stop, getStatus, getInfo } from '../../electron/python-manager'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('M-PY-MANAGER', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(onCallbacks).forEach((k) => delete onCallbacks[k])
    mockAccess.mockRejectedValue(new Error('not found'))
    mockFetch.mockReset()
  })

  it('returns status info when stopped', () => {
    expect(getStatus()).toEqual({ running: false, healthy: false, port: null })
    expect(getInfo()).toBeNull()
  })

  it('selects a free port when no preferred port given', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    mockAccess.mockResolvedValueOnce(undefined)

    const info = await start()

    expect(info.port).toBe(18777)
    expect(info.token).toBe('mock-token-hex-value')
    expect(info.baseUrl).toBe('http://127.0.0.1:18777')
    expect(info.running).toBe(true)
  })

  it('passes tokens through env not argv', async () => {
    const hfToken = 'hf_abc123'
    mockFetch.mockResolvedValueOnce({ ok: true })
    mockAccess.mockResolvedValueOnce(undefined)

    await start(undefined, hfToken)

    const spawnCall = mockSpawn.mock.calls[0]
    expect(spawnCall).toBeDefined()
    const callArgs = spawnCall as unknown as [string, string[], { env: Record<string, string> }]
    const env = callArgs[2].env
    expect(env.BACKEND_TOKEN).toBe('mock-token-hex-value')
    expect(env.HUGGINGFACE_HUB_TOKEN).toBe(hfToken)
    // Tokens should NOT appear in argv
    expect(callArgs[1]).not.toContain('mock-token-hex-value')
    expect(callArgs[1]).not.toContain(hfToken)
    expect(callArgs[1]).toContain('backend.server:create_app')
    expect(callArgs[1]).toContain('--factory')
  })

  it('sets a writable model cache dir for backend downloads', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    mockAccess.mockResolvedValueOnce(undefined)

    await start()

    const spawnCall = mockSpawn.mock.calls[0]
    const callArgs = spawnCall as unknown as [string, string[], { env: Record<string, string> }]
    expect(callArgs[2].env.MODEL_CACHE_DIR).toContain('WhisperAnnote')
    expect(callArgs[2].env.MODEL_CACHE_DIR).toContain('models')
  })

  it('uses project cwd for dev backend imports', async () => {
    const previousRendererUrl = process.env.ELECTRON_RENDERER_URL
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173'
    mockFetch.mockResolvedValueOnce({ ok: true })
    mockAccess.mockResolvedValueOnce(undefined)

    try {
      await start()

      const spawnCall = mockSpawn.mock.calls[0]
      const callArgs = spawnCall as unknown as [string, string[], { cwd: string }]
      expect(callArgs[2].cwd).toBe(process.cwd())
    } finally {
      if (previousRendererUrl === undefined) {
        delete process.env.ELECTRON_RENDERER_URL
      } else {
        process.env.ELECTRON_RENDERER_URL = previousRendererUrl
      }
    }
  })

  it('polls health endpoint until ready', { timeout: 8000 }, async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('not ready'))
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce({ ok: true })
    mockAccess.mockResolvedValueOnce(undefined)

    const info = await start()

    expect(info.running).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('stops backend gracefully', { timeout: 8000 }, async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    mockAccess.mockResolvedValueOnce(undefined)

    await start()
    expect(getStatus().running).toBe(true)

    const stopPromise = stop()

    // Simulate process exit
    const exitHandlers = onCallbacks['exit']
    expect(exitHandlers?.length).toBeGreaterThanOrEqual(1)

    // Call the latest exit handler
    exitHandlers[exitHandlers.length - 1](0)

    await stopPromise
    expect(getStatus().running).toBe(false)
    expect(getInfo()).toBeNull()
  })

  it('restarts backend by calling stop then start', { timeout: 8000 }, async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    mockAccess.mockResolvedValueOnce(undefined)

    await start()
    expect(getStatus().running).toBe(true)

    // Stop first with exit handler
    const stopPromise1 = stop()
    const exitHandlers1 = onCallbacks['exit']
    exitHandlers1[exitHandlers1.length - 1](0)
    await stopPromise1

    expect(getStatus().running).toBe(false)

    // Now start again
    mockFetch.mockResolvedValueOnce({ ok: true })
    mockAccess.mockResolvedValueOnce(undefined)

    const info = await start()
    expect(info.running).toBe(true)
  })

})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - Asserted uvicorn factory entrypoint matches backend.server:create_app.
//   LAST_CHANGE: v1.2.0 - Added dev backend cwd coverage for uvicorn backend.server imports.
//   LAST_CHANGE: v1.1.0 - Added model cache env coverage for first-run model download readiness.
// END_CHANGE_SUMMARY
