// FILE: tests/main/scheduler.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-SCHEDULER cron scan behavior for watch-folder auto-processing.
//   SCOPE: Node Vitest tests with fake cron and scan dependencies; no real timers or filesystem watcher.
//   DEPENDS: electron/scheduler, vitest
//   LINKS: M-SCHEDULER, V-M-SCHEDULER
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createCron - captures scheduled scan callbacks.
//   describe(M-SCHEDULER) - cron scheduling, scan emission, stop replacement.
// END_MODULE_MAP
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { Scheduler, type SchedulerOptions } from '../../electron/scheduler'

function createCron() {
  const task = { stop: vi.fn() }
  const schedule = vi.fn((_expression: string, _callback: () => void) => {
    return task
  })
  return { task, cronModule: { schedule } }
}

function createOptions(onFile = vi.fn()): SchedulerOptions {
  return {
    cronExpression: '*/5 * * * *',
    folder: 'H:/audio',
    onFile
  }
}

describe('M-SCHEDULER contracts', () => {
  it('schedules a cron scan and emits only files returned by M-WATCHER scan', async () => {
    const { cronModule } = createCron()
    const onFile = vi.fn()
    const scan = vi.fn(async () => [
      { filePath: 'H:/audio/a.wav', fileName: 'a.wav' },
      { filePath: 'H:/audio/b.mp3', fileName: 'b.mp3' }
    ])
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const scheduler = new Scheduler({ cronModule, scan })

    try {
      scheduler.schedule(createOptions(onFile))
      const result = await scheduler.runOnce()

      expect(cronModule.schedule).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function))
      expect(scan).toHaveBeenCalledWith('H:/audio')
      expect(result).toHaveLength(2)
      expect(onFile).toHaveBeenCalledTimes(2)
      expect(onFile).toHaveBeenCalledWith({ filePath: 'H:/audio/a.wav', fileName: 'a.wav' })
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Scheduler][runOnce][BLOCK_RUN_SCAN] cron scan completed',
        { count: 2, stage: 'scan' }
      )
    } finally {
      consoleSpy.mockRestore()
    }
  })

  it('stops the previous cron task when schedule is replaced', () => {
    const { cronModule, task } = createCron()
    const scheduler = new Scheduler({ cronModule, scan: vi.fn(async () => []) })

    scheduler.schedule(createOptions())
    scheduler.schedule(createOptions())

    expect(task.stop).toHaveBeenCalledTimes(1)
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Added module-local scheduler tests for cron scan and replacement behavior.
// END_CHANGE_SUMMARY
