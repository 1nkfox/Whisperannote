// FILE: electron/file-watcher.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Watch an input folder for stable audio files, ignoring generated/temp files and duplicate path+size+mtime events.
//   SCOPE: chokidar add events, 2s stabilization, audio extension filtering, deduplication, manual scan helper, singleton lifecycle.
//   DEPENDS: M-CONFIG-STORE, chokidar, node:fs, node:path
//   LINKS: M-WATCHER, V-M-WATCHER
//   ROLE: INTEGRATION
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FileWatcher - injectable watcher implementation used by singleton and tests.
//   startWatcher - starts the singleton watcher for a folder.
//   stopWatcher - stops the singleton watcher and clears pending stabilization timers.
//   getWatcherStatus - returns whether a folder is currently watched.
//   scanFolder - scans a folder with the same filtering and deduplication rules.
// END_MODULE_MAP
import { readdir as readDir, stat as readStat } from 'node:fs/promises'
import { basename, extname, normalize } from 'node:path'

import { watch, type FSWatcher } from 'chokidar'

import type { WatcherStatus } from '../src/shared'

export type NewFileEvent = {
  filePath: string
  fileName: string
}

export type WatcherStartOptions = {
  folder: string
  onFile: (event: NewFileEvent) => void
}

type WatcherLike = Pick<FSWatcher, 'on' | 'close'>
type WatcherFactory = (folder: string) => WatcherLike
type StatLike = { isFile: () => boolean; size: number; mtimeMs: number }

export type FileWatcherOptions = {
  stabilizeMs?: number
  watcherFactory?: WatcherFactory
  statFile?: (path: string) => Promise<StatLike>
  readDirectory?: typeof readDir
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
}

const AUDIO_EXTENSIONS = new Set(['.aac', '.flac', '.m4a', '.mp3', '.ogg', '.wav', '.webm', '.wma'])
const TEMP_EXTENSIONS = new Set(['.crdownload', '.part', '.tmp'])

function defaultWatcherFactory(folder: string): WatcherLike {
  return watch(folder, {
    awaitWriteFinish: false,
    depth: 0,
    ignoreInitial: true,
    persistent: true
  })
}

function isCandidateAudioPath(filePath: string): boolean {
  const fileName = basename(filePath)
  const lowerName = fileName.toLowerCase()
  const extension = extname(lowerName)

  if (!fileName || lowerName.startsWith('.') || lowerName.startsWith('~$')) {
    return false
  }

  if (TEMP_EXTENSIONS.has(extension) || [...TEMP_EXTENSIONS].some((tempExt) => lowerName.endsWith(tempExt))) {
    return false
  }

  return AUDIO_EXTENSIONS.has(extension)
}

// START_CONTRACT: FileWatcher
//   PURPOSE: Encapsulate watcher lifecycle, stabilization timers, and duplicate suppression.
//   INPUTS: { options: FileWatcherOptions - optional test doubles and timing }
//   OUTPUTS: FileWatcher - stateful watcher instance
//   SIDE_EFFECTS: opens chokidar watcher and schedules timers when start is called
//   LINKS: M-WATCHER, V-M-WATCHER
// END_CONTRACT: FileWatcher
export class FileWatcher {
  private readonly stabilizeMs: number
  private readonly watcherFactory: WatcherFactory
  private readonly statFile: (path: string) => Promise<StatLike>
  private readonly readDirectory: typeof readDir
  private readonly setTimer: typeof setTimeout
  private readonly clearTimer: typeof clearTimeout
  private readonly seenKeys = new Set<string>()
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>()
  private watcher: WatcherLike | null = null
  private folder: string | null = null
  private onFile: ((event: NewFileEvent) => void) | null = null

  constructor(options: FileWatcherOptions = {}) {
    this.stabilizeMs = options.stabilizeMs ?? 2000
    this.watcherFactory = options.watcherFactory ?? defaultWatcherFactory
    this.statFile = options.statFile ?? readStat
    this.readDirectory = options.readDirectory ?? readDir
    this.setTimer = options.setTimer ?? setTimeout
    this.clearTimer = options.clearTimer ?? clearTimeout
  }

  // START_CONTRACT: start
  //   PURPOSE: Start watching one folder and emit stabilized audio files to the callback.
  //   INPUTS: { options: WatcherStartOptions - folder and onFile callback }
  //   OUTPUTS: Promise<void>
  //   SIDE_EFFECTS: closes previous watcher, opens chokidar watcher, registers add handler
  //   LINKS: M-WATCHER, V-M-WATCHER
  // END_CONTRACT: start
  async start(options: WatcherStartOptions): Promise<void> {
    await this.stop()

    this.folder = options.folder
    this.onFile = options.onFile
    this.watcher = this.watcherFactory(options.folder)
    this.watcher.on('add', (filePath: string) => this.onAdd(filePath))
  }

  // START_CONTRACT: stop
  //   PURPOSE: Stop watching and cancel pending stabilization timers.
  //   INPUTS: none
  //   OUTPUTS: Promise<void>
  //   SIDE_EFFECTS: closes chokidar watcher and clears timers
  //   LINKS: M-WATCHER, V-M-WATCHER
  // END_CONTRACT: stop
  async stop(): Promise<void> {
    for (const timer of this.pending.values()) {
      this.clearTimer(timer)
    }
    this.pending.clear()

    if (this.watcher) {
      await this.watcher.close()
    }

    this.watcher = null
    this.folder = null
    this.onFile = null
  }

  // START_CONTRACT: status
  //   PURPOSE: Return current watcher status for IPC and renderer state.
  //   INPUTS: none
  //   OUTPUTS: WatcherStatus - active flag and folder if any
  //   SIDE_EFFECTS: none
  //   LINKS: M-WATCHER, V-M-WATCHER, M-SHARED
  // END_CONTRACT: status
  status(): WatcherStatus {
    return this.folder ? { watching: true, folder: this.folder } : { watching: false }
  }

  // START_CONTRACT: scan
  //   PURPOSE: Scan a folder once using the same filter and dedupe policy as watcher add events.
  //   INPUTS: { folder: string - folder to scan }
  //   OUTPUTS: Promise<NewFileEvent[]> - new stable audio files not seen before
  //   SIDE_EFFECTS: updates dedupe keys for returned files
  //   LINKS: M-WATCHER, V-M-SCHEDULER
  // END_CONTRACT: scan
  async scan(folder: string): Promise<NewFileEvent[]> {
    const entries = await this.readDirectory(folder, { withFileTypes: true })
    const events: NewFileEvent[] = []

    for (const entry of entries) {
      if (!entry.isFile()) {
        continue
      }

      const filePath = normalize(`${folder}/${entry.name}`)
      const event = await this.toStableEvent(filePath)
      if (event) {
        events.push(event)
      }
    }

    return events
  }

  private onAdd(filePath: string): void {
    // START_BLOCK_STABILIZE_FILE
    if (!isCandidateAudioPath(filePath)) {
      return
    }

    const normalized = normalize(filePath)
    const existing = this.pending.get(normalized)
    if (existing) {
      this.clearTimer(existing)
    }

    const timer = this.setTimer(() => {
      this.pending.delete(normalized)
      void this.toStableEvent(normalized).then((event) => {
        if (!event) {
          return
        }

        console.info('[Watcher][onAdd][BLOCK_STABILIZE_FILE] new file stabilized', {
          file_name: event.fileName,
          stage: 'watch'
        })
        this.onFile?.(event)
      })
    }, this.stabilizeMs)

    this.pending.set(normalized, timer)
    // END_BLOCK_STABILIZE_FILE
  }

  private async toStableEvent(filePath: string): Promise<NewFileEvent | null> {
    if (!isCandidateAudioPath(filePath)) {
      return null
    }

    const stats = await this.statFile(filePath)
    if (!stats.isFile()) {
      return null
    }

    const normalized = normalize(filePath)
    const dedupeKey = `${normalized}|${stats.size}|${stats.mtimeMs}`
    if (this.seenKeys.has(dedupeKey)) {
      return null
    }

    this.seenKeys.add(dedupeKey)
    return { filePath: normalized, fileName: basename(normalized) }
  }
}

const singleton = new FileWatcher()

// START_CONTRACT: startWatcher
//   PURPOSE: Start the process-wide watcher used by IPC and Electron Main.
//   INPUTS: { options: WatcherStartOptions - folder and event callback }
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: opens/refreshes the singleton chokidar watcher
//   LINKS: M-WATCHER, V-M-WATCHER, M-IPC
// END_CONTRACT: startWatcher
export function startWatcher(options: WatcherStartOptions): Promise<void> {
  return singleton.start(options)
}

// START_CONTRACT: stopWatcher
//   PURPOSE: Stop the process-wide watcher.
//   INPUTS: none
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: closes chokidar watcher and clears pending timers
//   LINKS: M-WATCHER, V-M-WATCHER, M-IPC
// END_CONTRACT: stopWatcher
export function stopWatcher(): Promise<void> {
  return singleton.stop()
}

// START_CONTRACT: getWatcherStatus
//   PURPOSE: Return process-wide watcher status for IPC.
//   INPUTS: none
//   OUTPUTS: WatcherStatus - active flag and folder if any
//   SIDE_EFFECTS: none
//   LINKS: M-WATCHER, V-M-WATCHER, M-IPC
// END_CONTRACT: getWatcherStatus
export function getWatcherStatus(): WatcherStatus {
  return singleton.status()
}

// START_CONTRACT: scanFolder
//   PURPOSE: Scan a folder once with watcher filtering/deduplication rules for scheduler use.
//   INPUTS: { folder: string - folder to scan }
//   OUTPUTS: Promise<NewFileEvent[]> - stable new audio files
//   SIDE_EFFECTS: updates singleton dedupe keys
//   LINKS: M-WATCHER, M-SCHEDULER, V-M-WATCHER
// END_CONTRACT: scanFolder
export function scanFolder(folder: string): Promise<NewFileEvent[]> {
  return singleton.scan(folder)
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Implemented Phase-5 watcher with stabilization, filtering, dedupe, and scan support.
// END_CHANGE_SUMMARY
