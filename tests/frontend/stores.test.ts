// FILE: tests/frontend/stores.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-STORES state actions for settings, transcription speaker names, batch queue, and backend status.
//   SCOPE: Deterministic Zustand store tests without IPC, HTTP, or filesystem access.
//   DEPENDS: src/stores, src/shared
//   LINKS: M-STORES, V-M-STORES
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createTask - local TaskInfo fixture builder.
//   createResult - local TranscriptionResult fixture builder.
//   describe(M-STORES) - contract checks for settings, speakers, token state, batch, and backend health.
// END_MODULE_MAP
import { beforeEach, describe, expect, it } from 'vitest'

import {
  resetAllStoresForTests,
  useBackendStore,
  useBatchStore,
  useSettingsStore,
  useTranscriptionStore
} from '../../src/stores'
import type { TaskInfo, TranscriptionResult } from '../../src/shared'

// START_CONTRACT: createResult
//   PURPOSE: Build a stable transcription result fixture with speaker names.
//   INPUTS: { taskId: string - task identifier }
//   OUTPUTS: TranscriptionResult - backend DTO mirror fixture
//   SIDE_EFFECTS: none
//   LINKS: M-STORES, V-M-STORES, M-SHARED
// END_CONTRACT: createResult
function createResult(taskId: string): TranscriptionResult {
  return {
    task_id: taskId,
    file_name: 'meeting.wav',
    language: 'ru',
    duration_sec: 12,
    segments: [
      { speaker: 'SPEAKER_00', start: 0, end: 1, text: 'Привет', confidence: null },
      { speaker: 'SPEAKER_01', start: 1, end: 2, text: 'Коллеги', confidence: 0.91 }
    ],
    full_text: 'Привет Коллеги',
    speaker_names: { SPEAKER_00: 'Анна' },
    output_files: { txt: 'meeting.txt' }
  }
}

// START_CONTRACT: createTask
//   PURPOSE: Build a stable queue task fixture for transcription store tests.
//   INPUTS: { taskId: string - task identifier, result?: TranscriptionResult | null - optional task result }
//   OUTPUTS: TaskInfo - backend DTO mirror fixture
//   SIDE_EFFECTS: none
//   LINKS: M-STORES, V-M-STORES, M-SHARED
// END_CONTRACT: createTask
function createTask(taskId: string, result: TranscriptionResult | null = null): TaskInfo {
  return {
    task_id: taskId,
    file_path: 'H:/audio/meeting.wav',
    file_name: 'meeting.wav',
    status: result ? 'completed' : 'queued',
    progress_percent: result ? 100 : 0,
    queue_position: 0,
    created_at: '2026-06-02T00:00:00Z',
    error_message: null,
    result
  }
}

describe('M-STORES contracts', () => {
  beforeEach(() => {
    resetAllStoresForTests()
  })

  it('keeps settings.device fixed to cuda through every settings action', () => {
    expect(useSettingsStore.getState().device).toBe('cuda')

    useSettingsStore.getState().updateSettings({ model: 'faster-whisper-medium', numSpeakers: 2 })
    expect(useSettingsStore.getState().device).toBe('cuda')
    expect(useSettingsStore.getState().model).toBe('faster-whisper-medium')
    expect(useSettingsStore.getState().numSpeakers).toBe(2)

    useSettingsStore.getState().applyConfig({
      language: 'ru',
      theme: 'dark',
      model: 'faster-whisper-large-v3-turbo',
      numSpeakers: null,
      outputFolder: 'H:/out',
      outputFormats: ['json'],
      watchFolder: null,
      watchEnabled: false,
      cronExpression: '0 * * * *',
      preferredPort: 8777,
      firstRun: false,
      hasHfToken: true
    })

    expect(useSettingsStore.getState().device).toBe('cuda')
    expect(useSettingsStore.getState().theme).toBe('dark')
  })

  it('reflects hasHfToken from secure store status without storing raw tokens', () => {
    expect(useSettingsStore.getState().hasHfToken).toBe(false)

    useSettingsStore.getState().setHasHfToken(true)
    expect(useSettingsStore.getState().hasHfToken).toBe(true)

    useSettingsStore.getState().setHasHfToken(false)
    expect(useSettingsStore.getState().hasHfToken).toBe(false)
    expect(Object.keys(useSettingsStore.getState())).not.toContain('hfToken')
  })

  it('updates and reads speakerNames by task id', () => {
    const taskId = 'task-1'
    const result = createResult(taskId)

    useTranscriptionStore.getState().upsertTask(createTask(taskId))
    useTranscriptionStore.getState().setTaskResult(taskId, result)
    useTranscriptionStore.getState().setSpeakerName(taskId, 'SPEAKER_01', 'Борис')

    expect(useTranscriptionStore.getState().activeTaskId).toBe(taskId)
    expect(useTranscriptionStore.getState().results[taskId]).toBe(result)
    expect(useTranscriptionStore.getState().speakerNames[taskId]).toEqual({
      SPEAKER_00: 'Анна',
      SPEAKER_01: 'Борис'
    })
  })

  it('moves batch queue items to history and updates backend health', () => {
    useBatchStore.getState().enqueue({ id: 'item-1', filePath: 'H:/audio/a.wav', fileName: 'a.wav', status: 'queued' })
    useBatchStore.getState().updateItem('item-1', { status: 'processing', taskId: 'task-1' })
    useBatchStore.getState().completeItem('item-1')

    expect(useBatchStore.getState().queue).toEqual([])
    expect(useBatchStore.getState().history[0]).toMatchObject({ id: 'item-1', status: 'completed', taskId: 'task-1' })

    useBackendStore.getState().setStatus({ running: true, healthy: true, port: 8777 })
    useBackendStore.getState().setHealth({
      status: 'ok',
      python_version: '3.11',
      cuda_available: true,
      cuda_devices: 1,
      whisper_ready: true,
      pyannote_ready: true,
      models_cached: ['faster-whisper-large-v3']
    })

    expect(useBackendStore.getState().status.healthy).toBe(true)
    expect(useBackendStore.getState().health?.cuda_available).toBe(true)
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Added module-local store contract tests for Phase-4 M-STORES.
// END_CHANGE_SUMMARY
