// FILE: src/components/batch/index.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render folder auto-processing controls, live queue, and processing history for batch transcription.
//   SCOPE: Watcher start/stop via Electron IPC, watcher:new-file intake, queue polling, cancellation, and store-backed history display.
//   DEPENDS: M-API-CLIENT, M-STORES, M-UI, React
//   LINKS: M-BATCH, V-M-BATCH, M-WATCHER, M-SCHEDULER
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   BatchView - folder config, queue list, history table, watcher event and polling integration.
// END_MODULE_MAP
import { useEffect, useMemo, useState } from 'react'

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui'
import type { ApiClient } from '../../lib/api'
import { useBatchStore, useBackendStore, useSettingsStore, useTranscriptionStore } from '../../stores'
import type { ElectronApi, MainToRendererEventMap, TaskInfo } from '../../shared'

type ElectronBatchApi = Pick<ElectronApi, 'invoke' | 'on'>

export type BatchViewProps = {
  client: Pick<ApiClient, 'enqueueFile' | 'queueStatus' | 'cancelTask'>
  electronApi?: ElectronBatchApi
  pollMs?: number
}

function resolveElectronApi(explicit?: ElectronBatchApi): ElectronBatchApi | null {
  if (explicit) {
    return explicit
  }

  if (typeof window === 'undefined') {
    return null
  }

  return (window as Window & { electron?: ElectronBatchApi }).electron ?? null
}

function queueStatusToBatchStatus(status: TaskInfo['status']): 'queued' | 'processing' | 'completed' | 'error' {
  if (status === 'completed') return 'completed'
  if (status === 'error' || status === 'cancelled') return 'error'
  if (status === 'queued') return 'queued'
  return 'processing'
}

// START_CONTRACT: BatchView
//   PURPOSE: Coordinate watch-folder settings, watcher events, queue polling, and cancellation UI.
//   INPUTS: { props: BatchViewProps - API client, optional Electron bridge, optional poll interval }
//   OUTPUTS: JSX.Element - batch processing view
//   SIDE_EFFECTS: invokes Electron IPC, polls backend queue, mutates M-STORES batch/backend/transcription state
//   LINKS: M-BATCH, V-M-BATCH, M-API-CLIENT, M-STORES, M-UI
// END_CONTRACT: BatchView
export function BatchView({ client, electronApi, pollMs = 2000 }: BatchViewProps) {
  const bridge = resolveElectronApi(electronApi)
  const watchFolder = useSettingsStore((state) => state.watchFolder)
  const watchEnabled = useSettingsStore((state) => state.watchEnabled)
  const cronExpression = useSettingsStore((state) => state.cronExpression)
  const outputFolder = useSettingsStore((state) => state.outputFolder)
  const model = useSettingsStore((state) => state.model)
  const outputFormats = useSettingsStore((state) => state.outputFormats)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const queue = useBatchStore((state) => state.queue)
  const history = useBatchStore((state) => state.history)
  const enqueue = useBatchStore((state) => state.enqueue)
  const updateItem = useBatchStore((state) => state.updateItem)
  const removeFromQueue = useBatchStore((state) => state.removeFromQueue)
  const completeItem = useBatchStore((state) => state.completeItem)
  const setWatcher = useBackendStore((state) => state.setWatcher)
  const upsertTask = useTranscriptionStore((state) => state.upsertTask)
  const [message, setMessage] = useState<string | null>(null)

  const queuedTaskIds = useMemo(() => new Set(queue.map((item) => item.taskId).filter(Boolean)), [queue])

  useEffect(() => {
    if (!watchEnabled || !watchFolder || !bridge) {
      return undefined
    }

    const unsubscribe = bridge.on('watcher:new-file', (event: MainToRendererEventMap['watcher:new-file']) => {
      // START_BLOCK_WATCHER_EVENT
      const id = `${event.filePath}`
      enqueue({ id, filePath: event.filePath, fileName: event.fileName, status: 'queued' })
      void client
        .enqueueFile({
          filePath: event.filePath,
          outputDir: outputFolder,
          model,
          language: 'ru',
          outputFormats
        })
        .then((task) => {
          upsertTask(task)
          updateItem(id, { taskId: task.task_id, status: queueStatusToBatchStatus(task.status) })
        })
        .catch((error: unknown) => {
          completeItem(id, {
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Failed to enqueue file'
          })
        })
      // END_BLOCK_WATCHER_EVENT
    })

    return unsubscribe
  }, [bridge, client, completeItem, enqueue, model, outputFolder, outputFormats, updateItem, upsertTask, watchEnabled, watchFolder])

  useEffect(() => {
    if (!watchEnabled) {
      return undefined
    }

    const timer = setInterval(() => {
      void client.queueStatus().then((tasks) => {
        for (const task of tasks) {
          upsertTask(task)
          const status = queueStatusToBatchStatus(task.status)
          const item = queue.find((entry) => entry.taskId === task.task_id || entry.filePath === task.file_path)

          if (item && (status === 'completed' || status === 'error')) {
            completeItem(item.id, { status, taskId: task.task_id, errorMessage: task.error_message ?? undefined })
          } else if (item) {
            updateItem(item.id, { status, taskId: task.task_id, errorMessage: task.error_message ?? undefined })
          } else if (!queuedTaskIds.has(task.task_id)) {
            enqueue({
              id: task.task_id,
              filePath: task.file_path,
              fileName: task.file_name,
              status,
              taskId: task.task_id,
              errorMessage: task.error_message ?? undefined
            })
          }
        }
      })
    }, pollMs)

    return () => clearInterval(timer)
  }, [client, completeItem, enqueue, pollMs, queue, queuedTaskIds, updateItem, upsertTask, watchEnabled])

  const startWatcher = async () => {
    if (!bridge || !watchFolder) {
      setMessage('Выберите папку для автообработки')
      return
    }

    await bridge.invoke('watcher:start', { folder: watchFolder, cron: cronExpression })
    updateSettings({ watchEnabled: true })
    setWatcher({ watching: true, folder: watchFolder })
    setMessage('Автообработка включена')
  }

  const stopWatcher = async () => {
    if (bridge) {
      await bridge.invoke('watcher:stop', undefined)
    }
    updateSettings({ watchEnabled: false })
    setWatcher({ watching: false })
    setMessage('Автообработка остановлена')
  }

  const cancelItem = async (id: string, taskId?: string) => {
    if (taskId) {
      await client.cancelTask(taskId)
    }
    removeFromQueue(id)
  }

  return (
    <section className="space-y-4" aria-label="Batch processing">
      <Card>
        <CardHeader>
          <CardTitle>Автообработка папки</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_180px_140px]">
          <div className="space-y-2">
            <Label htmlFor="watch-folder">Папка</Label>
            <Input
              id="watch-folder"
              value={watchFolder ?? ''}
              placeholder="H:/Meetings/Input"
              onChange={(event) => updateSettings({ watchFolder: event.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cron-expression">Cron</Label>
            <Input
              id="cron-expression"
              value={cronExpression}
              onChange={(event) => updateSettings({ cronExpression: event.target.value })}
            />
          </div>
          <div className="flex items-end gap-2">
            <Switch aria-label="Watch enabled" checked={watchEnabled} onClick={watchEnabled ? stopWatcher : startWatcher} />
            <Button onClick={watchEnabled ? stopWatcher : startWatcher}>{watchEnabled ? 'Стоп' : 'Старт'}</Button>
          </div>
        </CardContent>
      </Card>

      {message ? <div role="status" className="text-sm text-zinc-600 dark:text-zinc-300">{message}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Очередь</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Файл</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item) => (
                <TableRow key={item.id} data-testid="batch-queue-row">
                  <TableCell>{item.fileName}</TableCell>
                  <TableCell>{item.status}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => void cancelItem(item.id, item.taskId)}>
                      Удалить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>История</CardTitle>
        </CardHeader>
        <CardContent>
          <ul data-testid="batch-history" className="space-y-2 text-sm">
            {history.map((item) => (
              <li key={item.id}>{item.fileName}: {item.status}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Implemented Phase-5 batch view with watcher events, queue polling, and cancellation.
// END_CHANGE_SUMMARY
