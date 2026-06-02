// FILE: src/stores/index.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Provide Zustand stores for renderer settings, transcription tasks, batch state, and backend status.
//   SCOPE: In-memory renderer state actions; no direct IPC, HTTP, filesystem, or token persistence.
//   DEPENDS: src/shared
//   LINKS: M-STORES, V-M-STORES, M-SHARED
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   useSettingsStore - GPU-only app settings and secure-token presence state.
//   useTranscriptionStore - active task/result state plus speaker display names per task.
//   useBatchStore - batch queue and processing history state.
//   useBackendStore - backend/GPU health and watcher status state.
//   resetAllStoresForTests - deterministic state reset helper for module-local tests.
// END_MODULE_MAP
import { create } from 'zustand'

import type {
  AppConfig,
  AppTheme,
  BackendStatus,
  HealthStatus,
  OutputFormat,
  TaskInfo,
  TranscriptionResult,
  WatcherStatus,
  WhisperModel
} from '../shared'

export type SettingsState = Pick<
  AppConfig,
  | 'language'
  | 'theme'
  | 'model'
  | 'numSpeakers'
  | 'outputFolder'
  | 'outputFormats'
  | 'watchFolder'
  | 'watchEnabled'
  | 'cronExpression'
  | 'preferredPort'
  | 'firstRun'
  | 'hasHfToken'
> & {
  device: 'cuda'
}

export type SettingsPatch = Partial<
  Pick<
    SettingsState,
    | 'language'
    | 'theme'
    | 'model'
    | 'numSpeakers'
    | 'outputFolder'
    | 'outputFormats'
    | 'watchFolder'
    | 'watchEnabled'
    | 'cronExpression'
    | 'preferredPort'
    | 'firstRun'
    | 'hasHfToken'
  >
>

export type SettingsStore = SettingsState & {
  applyConfig: (config: AppConfig) => void
  updateSettings: (patch: SettingsPatch) => void
  setTheme: (theme: AppTheme) => void
  setModel: (model: WhisperModel) => void
  setNumSpeakers: (numSpeakers: number | null) => void
  setOutputFormats: (formats: OutputFormat[]) => void
  setHasHfToken: (hasHfToken: boolean) => void
  reset: () => void
}

export type TranscriptionTask = TaskInfo

export type TranscriptionStore = {
  tasks: Record<string, TranscriptionTask>
  activeTaskId: string | null
  results: Record<string, TranscriptionResult>
  speakerNames: Record<string, Record<string, string>>
  upsertTask: (task: TranscriptionTask) => void
  setActiveTask: (taskId: string | null) => void
  setTaskResult: (taskId: string, result: TranscriptionResult) => void
  setSpeakerName: (taskId: string, speakerId: string, displayName: string) => void
  clearTask: (taskId: string) => void
  reset: () => void
}

export type BatchQueueItem = {
  id: string
  filePath: string
  fileName: string
  status: 'queued' | 'processing' | 'completed' | 'error'
  taskId?: string
  errorMessage?: string
}

export type BatchStore = {
  queue: BatchQueueItem[]
  history: BatchQueueItem[]
  enqueue: (item: BatchQueueItem) => void
  updateItem: (id: string, patch: Partial<BatchQueueItem>) => void
  removeFromQueue: (id: string) => void
  completeItem: (id: string, patch?: Partial<BatchQueueItem>) => void
  reset: () => void
}

export type BackendStore = {
  status: BackendStatus
  health: HealthStatus | null
  watcher: WatcherStatus
  lastError: string | null
  setStatus: (status: BackendStatus) => void
  setHealth: (health: HealthStatus | null) => void
  setWatcher: (watcher: WatcherStatus) => void
  setLastError: (message: string | null) => void
  reset: () => void
}

const defaultSettings: SettingsState = {
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
  firstRun: true,
  hasHfToken: false,
  device: 'cuda'
}

const defaultBackendStatus: BackendStatus = {
  running: false,
  healthy: false,
  port: null
}

const defaultWatcherStatus: WatcherStatus = {
  watching: false
}

// START_CONTRACT: useSettingsStore
//   PURPOSE: Store app settings while preserving the project GPU-only invariant.
//   INPUTS: { action: SettingsStore action - patch or explicit field update }
//   OUTPUTS: SettingsStore - reactive settings state with device fixed to cuda
//   SIDE_EFFECTS: in-memory Zustand state updates
//   LINKS: M-STORES, V-M-STORES, M-SHARED
// END_CONTRACT: useSettingsStore
export const useSettingsStore = create<SettingsStore>((set) => ({
  ...defaultSettings,
  applyConfig: (config) => {
    // START_BLOCK_SETTINGS_GPU_ONLY
    set({ ...config, device: 'cuda' })
    // END_BLOCK_SETTINGS_GPU_ONLY
  },
  updateSettings: (patch) => {
    // START_BLOCK_SETTINGS_PATCH
    set((state) => ({ ...state, ...patch, device: 'cuda' }))
    // END_BLOCK_SETTINGS_PATCH
  },
  setTheme: (theme) => set({ theme }),
  setModel: (model) => set({ model }),
  setNumSpeakers: (numSpeakers) => set({ numSpeakers }),
  setOutputFormats: (outputFormats) => set({ outputFormats }),
  setHasHfToken: (hasHfToken) => set({ hasHfToken }),
  reset: () => set(defaultSettings)
}))

// START_CONTRACT: useTranscriptionStore
//   PURPOSE: Store task progress, completed results, and per-task speaker display names.
//   INPUTS: { action: TranscriptionStore action - task/result/speaker mutation }
//   OUTPUTS: TranscriptionStore - reactive transcription state
//   SIDE_EFFECTS: in-memory Zustand state updates
//   LINKS: M-STORES, V-M-STORES, M-SHARED
// END_CONTRACT: useTranscriptionStore
export const useTranscriptionStore = create<TranscriptionStore>((set) => ({
  tasks: {},
  activeTaskId: null,
  results: {},
  speakerNames: {},
  upsertTask: (task) => {
    // START_BLOCK_TASK_UPSERT
    set((state) => ({
      tasks: { ...state.tasks, [task.task_id]: task },
      activeTaskId: state.activeTaskId ?? task.task_id,
      results: task.result ? { ...state.results, [task.task_id]: task.result } : state.results
    }))
    // END_BLOCK_TASK_UPSERT
  },
  setActiveTask: (taskId) => set({ activeTaskId: taskId }),
  setTaskResult: (taskId, result) => {
    // START_BLOCK_RESULT_STORE
    set((state) => ({
      results: { ...state.results, [taskId]: result },
      speakerNames: {
        ...state.speakerNames,
        [taskId]: { ...(state.speakerNames[taskId] ?? {}), ...result.speaker_names }
      }
    }))
    // END_BLOCK_RESULT_STORE
  },
  setSpeakerName: (taskId, speakerId, displayName) => {
    // START_BLOCK_SPEAKER_NAMES
    set((state) => ({
      speakerNames: {
        ...state.speakerNames,
        [taskId]: {
          ...(state.speakerNames[taskId] ?? {}),
          [speakerId]: displayName.trim() || speakerId
        }
      }
    }))
    // END_BLOCK_SPEAKER_NAMES
  },
  clearTask: (taskId) => {
    set((state) => {
      const { [taskId]: _task, ...tasks } = state.tasks
      const { [taskId]: _result, ...results } = state.results
      const { [taskId]: _names, ...speakerNames } = state.speakerNames

      return {
        tasks,
        results,
        speakerNames,
        activeTaskId: state.activeTaskId === taskId ? null : state.activeTaskId
      }
    })
  },
  reset: () => set({ tasks: {}, activeTaskId: null, results: {}, speakerNames: {} })
}))

// START_CONTRACT: useBatchStore
//   PURPOSE: Store batch queue and history for later auto-processing UI modules.
//   INPUTS: { action: BatchStore action - queue or history mutation }
//   OUTPUTS: BatchStore - reactive batch state
//   SIDE_EFFECTS: in-memory Zustand state updates
//   LINKS: M-STORES, M-BATCH
// END_CONTRACT: useBatchStore
export const useBatchStore = create<BatchStore>((set) => ({
  queue: [],
  history: [],
  enqueue: (item) => set((state) => ({ queue: [...state.queue, item] })),
  updateItem: (id, patch) => {
    set((state) => ({ queue: state.queue.map((item) => (item.id === id ? { ...item, ...patch } : item)) }))
  },
  removeFromQueue: (id) => set((state) => ({ queue: state.queue.filter((item) => item.id !== id) })),
  completeItem: (id, patch = {}) => {
    set((state) => {
      const item = state.queue.find((entry) => entry.id === id)

      if (!item) {
        return state
      }

      const completed: BatchQueueItem = { ...item, ...patch, status: patch.status ?? 'completed' }

      return {
        queue: state.queue.filter((entry) => entry.id !== id),
        history: [completed, ...state.history]
      }
    })
  },
  reset: () => set({ queue: [], history: [] })
}))

// START_CONTRACT: useBackendStore
//   PURPOSE: Store backend, GPU health, watcher status, and the latest user-visible backend error.
//   INPUTS: { action: BackendStore action - status, health, watcher, or error update }
//   OUTPUTS: BackendStore - reactive backend state
//   SIDE_EFFECTS: in-memory Zustand state updates
//   LINKS: M-STORES, V-M-STORES, M-SERVER
// END_CONTRACT: useBackendStore
export const useBackendStore = create<BackendStore>((set) => ({
  status: defaultBackendStatus,
  health: null,
  watcher: defaultWatcherStatus,
  lastError: null,
  setStatus: (status) => set({ status }),
  setHealth: (health) => set({ health }),
  setWatcher: (watcher) => set({ watcher }),
  setLastError: (lastError) => set({ lastError }),
  reset: () => set({ status: defaultBackendStatus, health: null, watcher: defaultWatcherStatus, lastError: null })
}))

// START_CONTRACT: resetAllStoresForTests
//   PURPOSE: Reset every M-STORES store to deterministic defaults for isolated module tests.
//   INPUTS: none
//   OUTPUTS: void
//   SIDE_EFFECTS: clears in-memory Zustand state
//   LINKS: M-STORES, V-M-STORES
// END_CONTRACT: resetAllStoresForTests
export function resetAllStoresForTests(): void {
  useSettingsStore.getState().reset()
  useTranscriptionStore.getState().reset()
  useBatchStore.getState().reset()
  useBackendStore.getState().reset()
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Implemented Phase-4 renderer stores with GPU-only settings and speaker-name state.
// END_CHANGE_SUMMARY
