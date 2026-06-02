// FILE: tests/frontend/upload.test.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-UPLOAD drag/drop, file picker, quick settings, and task creation behavior.
//   SCOPE: jsdom React tests with a fake API client; no backend or filesystem access.
//   DEPENDS: src/components/upload, src/stores, @testing-library/react
//   LINKS: M-UPLOAD, V-M-UPLOAD
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createTask - local task fixture builder.
//   describe(M-UPLOAD) - drag-and-drop, file picker, and transcribe task checks.
// END_MODULE_MAP
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UploadView } from '../../src/components/upload'
import { resetAllStoresForTests, useTranscriptionStore } from '../../src/stores'
import type { TaskInfo } from '../../src/shared'

// START_CONTRACT: createTask
//   PURPOSE: Build a stable transcription task fixture for upload tests.
//   INPUTS: { taskId: string - task identifier }
//   OUTPUTS: TaskInfo - backend DTO mirror fixture
//   SIDE_EFFECTS: none
//   LINKS: M-UPLOAD, V-M-UPLOAD, M-SHARED
// END_CONTRACT: createTask
function createTask(taskId: string): TaskInfo {
  return {
    task_id: taskId,
    file_path: 'H:/audio/meeting.wav',
    file_name: 'meeting.wav',
    status: 'queued',
    progress_percent: 0,
    queue_position: 1,
    created_at: '2026-06-02T00:00:00Z',
    error_message: null,
    result: null
  }
}

describe('M-UPLOAD contracts', () => {
  beforeEach(() => {
    resetAllStoresForTests()
  })

  it('creates a task from drag-and-drop and stores it as active', async () => {
    const transcribe = vi.fn(async () => createTask('task-1'))
    render(<UploadView client={{ transcribe }} />)

    const file = new File(['audio'], 'meeting.wav', { type: 'audio/wav' })
    fireEvent.drop(screen.getByRole('button', { name: 'Drop audio file' }), {
      dataTransfer: { files: [file] }
    })

    expect(screen.getByTestId('selected-file').textContent).toContain('meeting.wav')
    fireEvent.click(screen.getByRole('button', { name: 'Запустить транскрибацию' }))

    await screen.findByText('meeting.wav')
    expect(transcribe).toHaveBeenCalledWith({
      file,
      model: 'faster-whisper-large-v3',
      language: 'ru',
      numSpeakers: null
    })
    expect(useTranscriptionStore.getState().activeTaskId).toBe('task-1')
  })

  it('creates a task from file picker and passes quick settings', async () => {
    const transcribe = vi.fn(async () => createTask('task-2'))
    render(<UploadView client={{ transcribe }} />)

    fireEvent.change(screen.getByLabelText('Модель'), { target: { value: 'faster-whisper-medium' } })
    fireEvent.change(screen.getByLabelText('Спикеры'), { target: { value: '2' } })

    const file = new File(['audio'], 'picked.mp3', { type: 'audio/mpeg' })
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [file] }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Запустить транскрибацию' }))

    await screen.findByText('meeting.wav')
    expect(transcribe).toHaveBeenCalledWith({
      file,
      model: 'faster-whisper-medium',
      language: 'ru',
      numSpeakers: 2
    })
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Added module-local tests for file picker, drag-and-drop, and task creation.
// END_CHANGE_SUMMARY
