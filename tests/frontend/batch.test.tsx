// FILE: tests/frontend/batch.test.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-BATCH folder controls, queue/history rendering, watcher event enqueue, and queue deletion.
//   SCOPE: jsdom React tests with fake API client and Electron bridge; no backend or filesystem access.
//   DEPENDS: src/components/batch, src/stores, @testing-library/react
//   LINKS: M-BATCH, V-M-BATCH
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   createTask - stable TaskInfo fixture for queue polling/enqueue tests.
//   createElectronApi - fake Electron IPC bridge with watcher event capture.
//   describe(M-BATCH) - watcher start, event enqueue, queue deletion, history display.
// END_MODULE_MAP
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BatchView } from '../../src/components/batch'
import { resetAllStoresForTests, useBatchStore, useSettingsStore } from '../../src/stores'
import type { ElectronApi, IpcEvent, MainToRendererEventMap, TaskInfo } from '../../src/shared'

// START_CONTRACT: createTask
//   PURPOSE: Build a stable queued task fixture for batch tests.
//   INPUTS: { taskId: string - task identifier, status?: TaskInfo.status }
//   OUTPUTS: TaskInfo - backend DTO mirror fixture
//   SIDE_EFFECTS: none
//   LINKS: M-BATCH, V-M-BATCH, M-SHARED
// END_CONTRACT: createTask
function createTask(taskId: string, status: TaskInfo['status'] = 'queued'): TaskInfo {
  return {
    task_id: taskId,
    file_path: `H:/audio/${taskId}.wav`,
    file_name: `${taskId}.wav`,
    status,
    progress_percent: status === 'completed' ? 100 : 0,
    queue_position: 0,
    created_at: '2026-06-02T00:00:00Z',
    error_message: null,
    result: null
  }
}

function createElectronApi() {
  let watcherListener: ((payload: MainToRendererEventMap['watcher:new-file']) => void) | null = null
  const api = {
    invoke: vi.fn(async () => ({ ok: true })),
    on: vi.fn(<TEvent extends IpcEvent>(event: TEvent, listener: (payload: MainToRendererEventMap[TEvent]) => void) => {
      if (event === 'watcher:new-file') {
        watcherListener = listener as (payload: MainToRendererEventMap['watcher:new-file']) => void
      }
      return vi.fn()
    }),
    emitNewFile(payload: MainToRendererEventMap['watcher:new-file']) {
      watcherListener?.(payload)
    }
  }

  return api as Pick<ElectronApi, 'invoke' | 'on'> & { emitNewFile(payload: MainToRendererEventMap['watcher:new-file']): void; invoke: typeof api.invoke }
}

describe('M-BATCH contracts', () => {
  beforeEach(() => {
    resetAllStoresForTests()
    useSettingsStore.getState().updateSettings({ watchFolder: 'H:/audio', outputFolder: 'H:/out' })
  })

  it('starts watcher with folder and cron settings', async () => {
    const electronApi = createElectronApi()
    const client = {
      enqueueFile: vi.fn(async () => createTask('task-1')),
      queueStatus: vi.fn(async () => []),
      cancelTask: vi.fn(async () => undefined)
    }

    render(<BatchView client={client} electronApi={electronApi} />)
    fireEvent.click(screen.getByRole('button', { name: 'Старт' }))

    expect((await screen.findByRole('status')).textContent).toBe('Автообработка включена')
    expect(electronApi.invoke).toHaveBeenCalledWith('watcher:start', { folder: 'H:/audio', cron: '0 * * * *' })
    expect(useSettingsStore.getState().watchEnabled).toBe(true)
  })

  it('enqueues watcher new-file events and renders queue rows', async () => {
    const electronApi = createElectronApi()
    const client = {
      enqueueFile: vi.fn(async () => createTask('task-2')),
      queueStatus: vi.fn(async () => []),
      cancelTask: vi.fn(async () => undefined)
    }

    useSettingsStore.getState().updateSettings({ watchEnabled: true })
    render(<BatchView client={client} electronApi={electronApi} pollMs={10000} />)

    await act(async () => {
      electronApi.emitNewFile({ filePath: 'H:/audio/new.wav', fileName: 'new.wav' })
    })

    expect(client.enqueueFile).toHaveBeenCalledWith(expect.objectContaining({ filePath: 'H:/audio/new.wav' }))
    expect(await screen.findByText('new.wav')).toBeTruthy()
    expect(screen.getAllByTestId('batch-queue-row')).toHaveLength(1)
  })

  it('displays history and removes queued items by cancelling backend task', async () => {
    const electronApi = createElectronApi()
    const client = {
      enqueueFile: vi.fn(async () => createTask('task-3')),
      queueStatus: vi.fn(async () => []),
      cancelTask: vi.fn(async () => undefined)
    }

    useBatchStore.getState().enqueue({ id: 'item-1', filePath: 'H:/audio/a.wav', fileName: 'a.wav', status: 'queued', taskId: 'task-3' })
    useBatchStore.getState().enqueue({ id: 'item-2', filePath: 'H:/audio/done.wav', fileName: 'done.wav', status: 'queued' })
    useBatchStore.getState().completeItem('item-2')

    render(<BatchView client={client} electronApi={electronApi} />)

    expect(screen.getByTestId('batch-history').textContent).toContain('done.wav: completed')
    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))

    await act(async () => undefined)
    expect(client.cancelTask).toHaveBeenCalledWith('task-3')
    expect(useBatchStore.getState().queue).toEqual([])
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Added module-local tests for watcher start, queue rendering, and deletion.
// END_CHANGE_SUMMARY
