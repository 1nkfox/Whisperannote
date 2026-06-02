// FILE: tests/frontend/shared.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-SHARED IPC whitelist uniqueness, DTO shape compatibility, and WSMessage exhaustiveness.
//   SCOPE: Type-level and deterministic runtime assertions for src/shared.
//   DEPENDS: src/shared
//   LINKS: M-SHARED, V-M-SHARED
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   describe(M-SHARED) - uniqueness and DTO/WSMessage contract checks.
//   renderWsMessage - exhaustive discriminated-union helper for WSMessage.
// END_MODULE_MAP
import { describe, expect, it } from 'vitest'

import { IPC_CHANNELS, IPC_EVENTS, type TaskInfo, type TranscriptionResult, type WSMessage } from '../../src/shared'

// START_CONTRACT: renderWsMessage
//   PURPOSE: Exercise exhaustive narrowing for WSMessage variants in typecheck and runtime tests.
//   INPUTS: { message: WSMessage - backend progress message }
//   OUTPUTS: string - stable textual representation used by assertions
//   SIDE_EFFECTS: none
//   LINKS: M-SHARED, V-M-SHARED
// END_CONTRACT: renderWsMessage
function renderWsMessage(message: WSMessage): string {
  // START_BLOCK_WS_EXHAUSTIVE
  switch (message.type) {
    case 'stage':
      return `stage:${message.stage}`
    case 'progress':
      return `progress:${message.percent}:${message.message ?? ''}`
    case 'log':
      return `log:${message.message}`
    case 'complete':
      return `complete:${message.duration_sec}:${Object.keys(message.output_files).length}`
    case 'error':
      return `error:${message.message}`
    default: {
      const neverMessage: never = message
      return neverMessage
    }
  }
  // END_BLOCK_WS_EXHAUSTIVE
}

describe('M-SHARED contracts', () => {
  it('keeps IPC channels unique', () => {
    expect(new Set(IPC_CHANNELS).size).toBe(IPC_CHANNELS.length)
    expect(IPC_CHANNELS).toContain('backend:get-info')
    expect(IPC_CHANNELS).toContain('config:set-hf-token')
  })

  it('keeps IPC events unique', () => {
    expect(new Set(IPC_EVENTS).size).toBe(IPC_EVENTS.length)
    expect(IPC_EVENTS).toEqual(['watcher:new-file', 'backend:status', 'backend:log'])
  })

  it('exhaustively handles WSMessage variants', () => {
    const messages: WSMessage[] = [
      { type: 'stage', stage: 'transcribing' },
      { type: 'progress', percent: 50, message: 'half' },
      { type: 'log', message: 'line' },
      { type: 'complete', output_files: { txt: 'out.txt' }, duration_sec: 1.25 },
      { type: 'error', message: 'failed' }
    ]

    expect(messages.map(renderWsMessage)).toEqual([
      'stage:transcribing',
      'progress:50:half',
      'log:line',
      'complete:1.25:1',
      'error:failed'
    ])
  })

  it('preserves backend DTO snake_case fields', () => {
    const result: TranscriptionResult = {
      task_id: 'task-1',
      file_name: 'meeting.wav',
      language: 'ru',
      duration_sec: 3,
      segments: [{ speaker: 'SPEAKER_00', start: 0, end: 1, text: 'Привет', confidence: null }],
      full_text: 'Привет',
      speaker_names: { SPEAKER_00: 'Анна' },
      output_files: { txt: 'meeting.txt' }
    }

    const task: TaskInfo = {
      task_id: result.task_id,
      file_path: 'H:/audio/meeting.wav',
      file_name: result.file_name,
      status: 'completed',
      progress_percent: 100,
      queue_position: 0,
      created_at: '2026-06-02T00:00:00Z',
      error_message: null,
      result
    }

    expect(task.result?.segments[0]?.confidence).toBeNull()
    expect(Object.keys(task.result ?? {})).toContain('duration_sec')
    expect(Object.keys(task)).toContain('progress_percent')
  })
})
