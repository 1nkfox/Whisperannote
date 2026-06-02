// FILE: src/components/upload/index.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render manual upload UI with drag-and-drop, file picker, quick settings, transcribe start, and progress card.
//   SCOPE: Renderer UI orchestration over M-API-CLIENT and M-STORES; no direct filesystem or backend URL discovery.
//   DEPENDS: React, src/lib/api, src/stores, src/components/ui
//   LINKS: M-UPLOAD, V-M-UPLOAD, M-API-CLIENT, M-STORES, M-UI
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   UploadView - manual transcription tab with dropzone, file picker, quick settings, and ProgressCard.
//   ProgressCard - task progress/status display for the active transcription task.
// END_MODULE_MAP
import React, { useRef, useState } from 'react'

import type { ApiClient } from '../../lib/api'
import { useSettingsStore, useTranscriptionStore } from '../../stores'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Progress, Select } from '../ui'

export type UploadViewProps = {
  client: Pick<ApiClient, 'transcribe'>
}

function fileListToArray(files: FileList | null): File[] {
  return files ? Array.from(files) : []
}

// START_CONTRACT: ProgressCard
//   PURPOSE: Show the active task status and numeric progress from the transcription store.
//   INPUTS: { taskId: string | null - active task id }
//   OUTPUTS: JSX.Element | null - progress card or empty state
//   SIDE_EFFECTS: none
//   LINKS: M-UPLOAD, V-M-UPLOAD, M-STORES
// END_CONTRACT: ProgressCard
export function ProgressCard({ taskId }: { taskId: string | null }) {
  const task = useTranscriptionStore((state) => (taskId ? state.tasks[taskId] : undefined))

  if (!task) {
    return null
  }

  return (
    <Card aria-label="Progress card">
      <CardHeader>
        <CardTitle>{task.file_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={task.progress_percent} />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {task.status} · {task.progress_percent}%
        </p>
      </CardContent>
    </Card>
  )
}

// START_CONTRACT: UploadView
//   PURPOSE: Accept one audio file through drag-and-drop or file picker and create a backend transcription task.
//   INPUTS: { props: UploadViewProps - API client facade }
//   OUTPUTS: JSX.Element - upload tab UI
//   SIDE_EFFECTS: invokes backend transcribe API and updates M-STORES task/settings state
//   LINKS: M-UPLOAD, V-M-UPLOAD, M-API-CLIENT, M-STORES, M-UI
// END_CONTRACT: UploadView
export function UploadView({ client }: UploadViewProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const model = useSettingsStore((state) => state.model)
  const numSpeakers = useSettingsStore((state) => state.numSpeakers)
  const setModel = useSettingsStore((state) => state.setModel)
  const setNumSpeakers = useSettingsStore((state) => state.setNumSpeakers)
  const activeTaskId = useTranscriptionStore((state) => state.activeTaskId)
  const upsertTask = useTranscriptionStore((state) => state.upsertTask)
  const setActiveTask = useTranscriptionStore((state) => state.setActiveTask)

  const selectFirstFile = (files: File[]) => {
    setError(null)

    if (files.length > 0) {
      setSelectedFile(files[0])
    }
  }

  const startTranscription = async () => {
    // START_BLOCK_CREATE_TASK
    if (!selectedFile) {
      setError('Выберите аудиофайл')
      return
    }

    try {
      const task = await client.transcribe({ file: selectedFile, model, language: 'ru', numSpeakers })
      upsertTask(task)
      setActiveTask(task.task_id)
      setError(null)
    } catch (apiError) {
      setError(apiError instanceof Error ? apiError.message : 'Не удалось создать задачу')
    }
    // END_BLOCK_CREATE_TASK
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <section className="space-y-4">
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop audio file"
          className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
            isDragging ? 'border-zinc-950 bg-zinc-100 dark:border-zinc-50 dark:bg-zinc-900' : 'border-zinc-300 dark:border-zinc-700'
          }`}
          onDragOver={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setIsDragging(false)
            selectFirstFile(fileListToArray(event.dataTransfer.files))
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              inputRef.current?.click()
            }
          }}
        >
          <p className="text-lg font-semibold">Перетащите аудио сюда</p>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">или выберите файл вручную</p>
          <Button className="mt-4" onClick={() => inputRef.current?.click()}>
            Выбрать файл
          </Button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
            onChange={(event) => selectFirstFile(fileListToArray(event.currentTarget.files))}
          />
        </div>

        {selectedFile ? <p data-testid="selected-file">Выбран: {selectedFile.name}</p> : null}
        {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}

        <Button onClick={startTranscription} disabled={!selectedFile}>
          Запустить транскрибацию
        </Button>
      </section>

      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>QuickSettings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="model">Модель</Label>
              <Select id="model" value={model} onChange={(event) => setModel(event.currentTarget.value as typeof model)}>
                <option value="faster-whisper-large-v3">large-v3</option>
                <option value="faster-whisper-large-v3-turbo">large-v3-turbo</option>
                <option value="faster-whisper-medium">medium</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="num-speakers">Спикеры</Label>
              <Input
                id="num-speakers"
                type="number"
                min={1}
                placeholder="auto"
                value={numSpeakers ?? ''}
                onChange={(event) => {
                  const value = event.currentTarget.value
                  setNumSpeakers(value ? Number(value) : null)
                }}
              />
            </div>
          </CardContent>
        </Card>
        <ProgressCard taskId={activeTaskId} />
      </aside>
    </div>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Implemented manual upload view with quick settings and task creation.
// END_CHANGE_SUMMARY
