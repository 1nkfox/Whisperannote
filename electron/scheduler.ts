// FILE: electron/scheduler.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Schedule periodic watch-folder scans and enqueue only files that M-WATCHER has not already seen.
//   SCOPE: node-cron lifecycle, scan trigger, singleton schedule/stop/status wrappers.
//   DEPENDS: M-WATCHER, M-CONFIG-STORE, node-cron
//   LINKS: M-SCHEDULER, V-M-SCHEDULER, M-WATCHER
//   ROLE: INTEGRATION
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   Scheduler - injectable scheduler implementation for cron-driven scans.
//   scheduleScan - starts/replaces the singleton cron schedule.
//   stopSchedule - stops the singleton cron schedule.
//   runScheduledScan - runs one singleton scan immediately.
// END_MODULE_MAP
import cron from 'node-cron'

import { scanFolder, type NewFileEvent } from './file-watcher'

export type SchedulerOptions = {
  cronExpression: string
  folder: string
  onFile: (event: NewFileEvent) => void
}

type ScheduledTaskLike = { stop: () => void }
type CronModule = { schedule: (expression: string, callback: () => void) => ScheduledTaskLike }
type ScanFolder = (folder: string) => Promise<NewFileEvent[]>

export type SchedulerDependencies = {
  cronModule?: CronModule
  scan?: ScanFolder
}

// START_CONTRACT: Scheduler
//   PURPOSE: Own one cron task that scans the watch folder and emits newly discovered files.
//   INPUTS: { dependencies: SchedulerDependencies - optional cron and scan doubles }
//   OUTPUTS: Scheduler - stateful scheduler instance
//   SIDE_EFFECTS: creates/stops node-cron tasks when schedule/stop are called
//   LINKS: M-SCHEDULER, V-M-SCHEDULER, M-WATCHER
// END_CONTRACT: Scheduler
export class Scheduler {
  private readonly cronModule: CronModule
  private readonly scan: ScanFolder
  private task: ScheduledTaskLike | null = null
  private options: SchedulerOptions | null = null

  constructor(dependencies: SchedulerDependencies = {}) {
    this.cronModule = dependencies.cronModule ?? cron
    this.scan = dependencies.scan ?? scanFolder
  }

  // START_CONTRACT: schedule
  //   PURPOSE: Start or replace the cron task for periodic folder scanning.
  //   INPUTS: { options: SchedulerOptions - cron expression, folder, and file callback }
  //   OUTPUTS: void
  //   SIDE_EFFECTS: stops previous task and starts a new node-cron task
  //   LINKS: M-SCHEDULER, V-M-SCHEDULER
  // END_CONTRACT: schedule
  schedule(options: SchedulerOptions): void {
    this.stop()
    this.options = options
    this.task = this.cronModule.schedule(options.cronExpression, () => {
      void this.runOnce()
    })
  }

  // START_CONTRACT: runOnce
  //   PURPOSE: Execute one scan and emit newly discovered files.
  //   INPUTS: none
  //   OUTPUTS: Promise<NewFileEvent[]> - files emitted during this scan
  //   SIDE_EFFECTS: calls configured onFile for each new file and logs scan count
  //   LINKS: M-SCHEDULER, V-M-SCHEDULER, M-WATCHER
  // END_CONTRACT: runOnce
  async runOnce(): Promise<NewFileEvent[]> {
    if (!this.options) {
      return []
    }

    // START_BLOCK_RUN_SCAN
    const events = await this.scan(this.options.folder)
    console.info('[Scheduler][runOnce][BLOCK_RUN_SCAN] cron scan completed', {
      count: events.length,
      stage: 'scan'
    })

    for (const event of events) {
      this.options.onFile(event)
    }

    return events
    // END_BLOCK_RUN_SCAN
  }

  // START_CONTRACT: stop
  //   PURPOSE: Stop the active cron task if present.
  //   INPUTS: none
  //   OUTPUTS: void
  //   SIDE_EFFECTS: stops node-cron task and clears scheduler options
  //   LINKS: M-SCHEDULER, V-M-SCHEDULER
  // END_CONTRACT: stop
  stop(): void {
    this.task?.stop()
    this.task = null
    this.options = null
  }
}

const singleton = new Scheduler()

// START_CONTRACT: scheduleScan
//   PURPOSE: Start the process-wide cron scan schedule.
//   INPUTS: { options: SchedulerOptions - cron expression, folder, and file callback }
//   OUTPUTS: void
//   SIDE_EFFECTS: starts/replaces singleton node-cron task
//   LINKS: M-SCHEDULER, V-M-SCHEDULER, M-IPC
// END_CONTRACT: scheduleScan
export function scheduleScan(options: SchedulerOptions): void {
  singleton.schedule(options)
}

// START_CONTRACT: runScheduledScan
//   PURPOSE: Run one process-wide scheduled scan immediately.
//   INPUTS: none
//   OUTPUTS: Promise<NewFileEvent[]> - files emitted during scan
//   SIDE_EFFECTS: calls singleton onFile callback for each new file
//   LINKS: M-SCHEDULER, V-M-SCHEDULER
// END_CONTRACT: runScheduledScan
export function runScheduledScan(): Promise<NewFileEvent[]> {
  return singleton.runOnce()
}

// START_CONTRACT: stopSchedule
//   PURPOSE: Stop the process-wide cron scan schedule.
//   INPUTS: none
//   OUTPUTS: void
//   SIDE_EFFECTS: stops singleton node-cron task
//   LINKS: M-SCHEDULER, V-M-SCHEDULER, M-IPC
// END_CONTRACT: stopSchedule
export function stopSchedule(): void {
  singleton.stop()
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Implemented Phase-5 cron scheduler around M-WATCHER scan dedupe.
// END_CHANGE_SUMMARY
