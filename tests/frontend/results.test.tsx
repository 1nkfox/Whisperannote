// FILE: tests/frontend/results.test.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-RESULTS virtualization, speaker renaming, and export preview behavior.
//   SCOPE: jsdom React tests for result UI with synthetic transcript data; no backend or filesystem access.
//   DEPENDS: src/components/transcription, src/stores, @testing-library/react
//   LINKS: M-RESULTS, V-M-RESULTS
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createResult - synthetic TranscriptionResult builder including 5000-segment data.
//   describe(M-RESULTS) - virtualization and speaker rename/export checks.
// END_MODULE_MAP
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ResultsView } from '../../src/components/transcription'
import { resetAllStoresForTests, useTranscriptionStore } from '../../src/stores'
import type { TranscriptSegment, TranscriptionResult } from '../../src/shared'

// START_CONTRACT: createResult
//   PURPOSE: Build deterministic transcription results for virtualization and speaker tests.
//   INPUTS: { count: number - segment count }
//   OUTPUTS: TranscriptionResult - backend DTO mirror fixture
//   SIDE_EFFECTS: none
//   LINKS: M-RESULTS, V-M-RESULTS, M-SHARED
// END_CONTRACT: createResult
function createResult(count: number): TranscriptionResult {
  const segments: TranscriptSegment[] = Array.from({ length: count }, (_, index) => ({
    speaker: index % 2 === 0 ? 'SPEAKER_00' : 'SPEAKER_01',
    start: index,
    end: index + 0.5,
    text: `Segment ${index}`,
    confidence: null
  }))

  return {
    task_id: 'task-1',
    file_name: 'meeting.wav',
    language: 'ru',
    duration_sec: count,
    segments,
    full_text: segments.map((segment) => segment.text).join(' '),
    speaker_names: { SPEAKER_00: 'Анна' },
    output_files: { txt: 'meeting.txt', json: 'meeting.json' }
  }
}

describe('M-RESULTS contracts', () => {
  beforeEach(() => {
    resetAllStoresForTests()
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) }
    })
  })

  it('renders a virtualized window for 5000 segments', () => {
    render(<ResultsView result={createResult(5000)} />)

    const rows = screen.getAllByTestId('segment-row')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(100)
    expect(screen.getByText(/5000 segments/)).toBeTruthy()
  })

  it('renames speakers through the store and reflects names in export preview and copy', async () => {
    render(<ResultsView result={createResult(4)} />)

    fireEvent.change(screen.getByLabelText('SPEAKER_01'), { target: { value: 'Борис' } })

    expect(useTranscriptionStore.getState().speakerNames['task-1']).toMatchObject({ SPEAKER_01: 'Борис' })
    expect(screen.getByTestId('export-preview').textContent).toContain('Борис: Segment 1')

    fireEvent.click(screen.getByRole('button', { name: 'Копировать transcript' }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Борис: Segment 1'))
    expect((await screen.findByRole('status')).textContent).toBe('Скопировано')
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Added module-local virtualization and speaker rename/export tests.
// END_CHANGE_SUMMARY
