// FILE: tests/main/preload.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify preload contextBridge exposes only the whitelisted Electron API.
//   SCOPE: Mocked electron contextBridge and ipcRenderer for deterministic Vitest tests.
//   DEPENDS: electron/preload, vitest
//   LINKS: M-PRELOAD, V-M-PRELOAD
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   describe(M-PRELOAD) - API shape, invoke passthrough, event subscription cleanup.
// END_MODULE_MAP
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const mockExposeInMainWorld = vi.fn()
const mockInvoke = vi.fn()
const mockOn = vi.fn()
const mockRemoveListener = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mockExposeInMainWorld
  },
  ipcRenderer: {
    invoke: mockInvoke,
    on: mockOn,
    removeListener: mockRemoveListener
  }
}))

await import('../../electron/preload')

const exposedApi = mockExposeInMainWorld.mock.calls[0]?.[1] as Record<string, unknown> | undefined

describe('M-PRELOAD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exposes window.electron with invoke and on methods', () => {
    expect(exposedApi).toBeDefined()
    expect(typeof exposedApi?.invoke).toBe('function')
    expect(typeof exposedApi?.on).toBe('function')
  })

  it('invoke delegates to ipcRenderer.invoke', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true })

    const result = await (exposedApi?.invoke as (ch: string, req?: unknown) => Promise<unknown>)(
      'config:get',
      undefined
    )

    expect(mockInvoke).toHaveBeenCalledWith('config:get', undefined)
    expect(result).toEqual({ ok: true })
  })

  it('on subscribes with ipcRenderer.on and returns unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = (exposedApi?.on as (ev: string, cb: (p: unknown) => void) => () => void)(
      'watcher:new-file',
      listener
    )

    expect(mockOn).toHaveBeenCalledWith('watcher:new-file', expect.any(Function))

    const handler = mockOn.mock.calls[0][1]
    handler({}, { filePath: '/test', fileName: 'test.wav' })
    expect(listener).toHaveBeenCalledWith({ filePath: '/test', fileName: 'test.wav' })

    unsubscribe()
    expect(mockRemoveListener).toHaveBeenCalledWith('watcher:new-file', handler)
  })

  it('does not expose Node.js APIs', () => {
    expect((exposedApi as Record<string, unknown>).require).toBeUndefined()
    expect((exposedApi as Record<string, unknown>).process).toBeUndefined()
  })
})
