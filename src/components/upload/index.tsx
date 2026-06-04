// FILE: src/components/upload/index.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render Figma-styled manual upload UI with drag-and-drop, file picker, quick settings, transcribe start, and progress card.
//   SCOPE: Renderer UI orchestration over M-API-CLIENT and M-STORES; no direct filesystem or backend URL discovery.
//   DEPENDS: React, src/lib/api, src/stores, src/components/ui
//   LINKS: M-UPLOAD, V-M-UPLOAD, M-API-CLIENT, M-STORES, M-UI
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   UploadView - manual transcription tab with Figma-derived dropzone, file card, height-aligned quick settings, and ProgressCard.
//   ProgressCard - staged task progress/status display for the active transcription task.
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

function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes'
  }

  const units = ['Bytes', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unitIndex

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function resolveStageIndex(status: string): number {
  const stages = ['queued', 'converting', 'diarizing', 'transcribing', 'formatting', 'completed']
  return Math.max(0, stages.indexOf(status))
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
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6C7278]">Processing audio</p>
        <CardTitle>{task.file_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-1" aria-hidden="true">
            {['Queue', 'Convert', 'Diarize', 'Text', 'Format', 'Done'].map((stage, index) => (
              <div key={stage} className={index <= resolveStageIndex(task.status) ? 'h-1 bg-[#B8422E]' : 'h-1 bg-[#EEECE9] dark:bg-zinc-800'} />
            ))}
          </div>
          <div className="flex justify-between text-[0.68rem] font-medium uppercase tracking-[0.08em] text-[#6C7278]">
            <span>{task.status}</span>
            <span>{task.queue_position > 0 ? `#${task.queue_position}` : 'active'}</span>
          </div>
        </div>
        <div className="rounded-[4px] bg-[#F7F5F2] p-4 dark:bg-zinc-950">
          <Progress value={task.progress_percent} />
          <p className="mt-3 flex justify-between text-sm text-[#6C7278] dark:text-zinc-400">
            <span>{task.progress_percent}% complete</span>
            <span>{task.error_message ?? 'CUDA pipeline'}</span>
          </p>
        </div>
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
    <div className="grid h-full min-h-0 items-stretch gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-h-0 overflow-hidden">

          <div
            role="button"
            tabIndex={0}
            aria-label="Drop audio file"
            className={`flex h-full min-h-0 rounded-lg border bg-white p-6 text-center transition-colors dark:bg-zinc-950 ${
              isDragging
                ? 'border-[#B8422E] bg-white dark:bg-zinc-950'
                : 'border-[rgba(108,114,120,0.2)] hover:border-[#6C7278] dark:border-zinc-800'
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
            {selectedFile ? (
              <div className="flex h-full flex-col text-left" data-testid="selected-file">
                <div className="flex items-start gap-4 border-b border-[rgba(108,114,120,0.2)] pb-6">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[4px] border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] text-2xl text-[#1A1C1E] dark:bg-zinc-900 dark:text-zinc-50">
                    ♪
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-2xl font-medium leading-tight text-[#1A1C1E] dark:text-zinc-50">Выбран: {selectedFile.name}</p>
                    <p className="mt-2 text-sm text-[#6C7278]">{formatFileSize(selectedFile.size)} · audio source · русский</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>
                    Убрать
                  </Button>
                </div>
                <div className="mt-6 flex min-h-0 flex-1 items-end gap-1 rounded-lg border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] px-6 py-7 dark:border-zinc-800 dark:bg-zinc-900" aria-hidden="true">
                  {[32, 48, 64, 42, 76, 36, 58, 88, 52, 70, 44, 62, 38, 82, 56, 46, 72, 40, 66, 50, 78, 34, 60, 45].map((height, index) => (
                    <span key={index} className="flex-1 rounded-full bg-[#1A1C1E]/75 dark:bg-zinc-100/75" style={{ height: `${height}%` }} />
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                    Заменить файл
                  </Button>
                  <span className="self-center text-xs font-medium uppercase tracking-[0.08em] text-[#6C7278]">Native faster-whisper, no manual chunking</span>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center">
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[4px] border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] text-3xl text-[#1A1C1E] dark:bg-zinc-900 dark:text-zinc-50">
                  ↑
                </div>
                <p className="mb-2 text-2xl font-medium tracking-[-0.02em] text-[#1A1C1E] dark:text-zinc-50">Перетащите аудио сюда</p>
                <p className="mb-6 max-w-md text-sm leading-6 text-[#6C7278]">WAV, MP3, M4A, OGG, FLAC. Локальная CUDA-обработка.</p>
                <Button variant="secondary" onClick={() => inputRef.current?.click()}>Выбрать файл</Button>
              </div>
            )}
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
              onChange={(event) => selectFirstFile(fileListToArray(event.currentTarget.files))}
            />
          </div>

          {error ? <p role="alert" className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
      </section>

      <aside className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
        <Card className="flex h-full min-h-0 flex-col">
          <CardHeader className="p-4 pb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6C7278]">Quick settings</p>
            <CardTitle className="text-lg">Параметры запуска</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4 pt-0">
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
            <div className="rounded-[4px] border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6C7278]">Язык</p>
              <p className="mt-1 font-medium">Русский · forced</p>
            </div>
            <div className="rounded-[4px] border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6C7278]">Device</p>
              <p className="mt-1 font-medium">GPU CUDA only</p>
            </div>
            <Button className="mt-auto w-full" onClick={startTranscription} disabled={!selectedFile}>
              Запустить транскрибацию
            </Button>
          </CardContent>
        </Card>
        <ProgressCard taskId={activeTaskId} />
      </aside>
    </div>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.4.2 - Compacted quick settings spacing and anchored the start button inside the aligned card.
//   LAST_CHANGE: v1.4.1 - Forced grid stretch and full-height quick settings card alignment with the upload dropzone.
//   LAST_CHANGE: v1.4.0 - Stretched the quick settings column so its bottom aligns with the upload dropzone.
//   LAST_CHANGE: v1.3.0 - Removed upload intro band and constrained upload layout to shell height without page scrollbars.
//   LAST_CHANGE: v1.2.0 - Reworked upload into Heritage editorial composition with large file canvas, right settings column, and one brick primary action.
//   LAST_CHANGE: v1.1.0 - Ported Figma upload card, waveform placeholder, quick settings sidebar, staged progress, and floating start bar while preserving task creation.
//   LAST_CHANGE: v1.0.0 - Implemented manual upload view with quick settings and task creation.
// END_CHANGE_SUMMARY
