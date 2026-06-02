// FILE: tests/main/file-watcher.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-WATCHER stabilization, filtering, and deduplication behavior.
//   SCOPE: Node Vitest tests with injected watcher/fs doubles; no real filesystem watcher required.
//   DEPENDS: electron/file-watcher, vitest
//   LINKS: M-WATCHER, V-M-WATCHER
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FakeChokidarWatcher - controllable add-event test double.
//   createWatcher - test factory with deterministic stat data and timers.
//   describe(M-WATCHER) - stabilization, ignored files, duplicate suppression.
// END_MODULE_MAP
// @vitest-environment node
import { normalize } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FileWatcher, type NewFileEvent } from '../../electron/file-watcher'

type AddHandler = (filePath: string) => void

class FakeChokidarWatcher {
  addHandler: AddHandler | null = null
  close = vi.fn(async () => undefined)

  on(event: string, handler: AddHandler): this {
    if (event === 'add') {
      this.addHandler = handler
    }
    return this
  }

  emitAdd(filePath: string): void {
    this.addHandler?.(filePath)
  }
}

function createWatcher(stats: Record<string, { size: number; mtimeMs: number }>) {
  const fake = new FakeChokidarWatcher()
  const events: NewFileEvent[] = []
  const watcher = new FileWatcher({
    stabilizeMs: 2000,
    watcherFactory: () => fake,
    statFile: async (filePath) => ({
      isFile: () => true,
      size: stats[filePath]?.size ?? 10,
      mtimeMs: stats[filePath]?.mtimeMs ?? 1
    })
  })

  return { fake, events, watcher }
}

describe('M-WATCHER contracts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits a new audio file only after the 2s stabilization window', async () => {
    const { fake, events, watcher } = createWatcher({ 'H:/audio/meeting.wav': { size: 128, mtimeMs: 20 } })
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    try {
      await watcher.start({ folder: 'H:/audio', onFile: (event) => events.push(event) })
      fake.emitAdd('H:/audio/meeting.wav')

      await vi.advanceTimersByTimeAsync(1999)
      expect(events).toEqual([])

      await vi.advanceTimersByTimeAsync(1)
      expect(events).toEqual([{ filePath: normalize('H:/audio/meeting.wav'), fileName: 'meeting.wav' }])
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Watcher][onAdd][BLOCK_STABILIZE_FILE] new file stabilized',
        { file_name: 'meeting.wav', stage: 'watch' }
      )
    } finally {
      consoleSpy.mockRestore()
      await watcher.stop()
    }
  })

  it('ignores temporary and generated non-audio files', async () => {
    const { fake, events, watcher } = createWatcher({})

    await watcher.start({ folder: 'H:/audio', onFile: (event) => events.push(event) })
    fake.emitAdd('H:/audio/.hidden.wav')
    fake.emitAdd('H:/audio/upload.wav.tmp')
    fake.emitAdd('H:/audio/result.docx')
    fake.emitAdd('H:/audio/transcript.txt')

    await vi.advanceTimersByTimeAsync(2000)
    expect(events).toEqual([])
    await watcher.stop()
  })

  it('deduplicates repeated add events by path, size, and mtime', async () => {
    const { fake, events, watcher } = createWatcher({ 'H:/audio/repeat.mp3': { size: 256, mtimeMs: 99 } })

    await watcher.start({ folder: 'H:/audio', onFile: (event) => events.push(event) })
    fake.emitAdd('H:/audio/repeat.mp3')
    await vi.advanceTimersByTimeAsync(2000)
    fake.emitAdd('H:/audio/repeat.mp3')
    await vi.advanceTimersByTimeAsync(2000)

    expect(events).toEqual([{ filePath: normalize('H:/audio/repeat.mp3'), fileName: 'repeat.mp3' }])
    await watcher.stop()
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Added module-local watcher tests for stabilization, filtering, and dedupe.
// END_CHANGE_SUMMARY
