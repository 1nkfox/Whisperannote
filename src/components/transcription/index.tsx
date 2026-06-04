// FILE: src/components/transcription/index.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render Figma-styled transcription results with a virtualized segment list, speaker renaming, export links, and copy support.
//   SCOPE: Result display and speaker-name state orchestration; no backend mutation or filesystem writes.
//   DEPENDS: React, @tanstack/react-virtual, src/stores, src/shared, src/components/ui
//   LINKS: M-RESULTS, V-M-RESULTS, M-API-CLIENT, M-STORES, M-UI
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ResultsView - Figma-derived result workspace for transcript, speaker legend, and export panel.
//   SegmentList - virtualized transcript segment list in a muted transcript canvas.
//   SpeakerLegend - speaker rename controls backed by M-STORES.
//   ExportPanel - copy/export action card using display speaker names.
// END_MODULE_MAP
import React, { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import type { TranscriptSegment, TranscriptionResult } from '../../shared'
import { useTranscriptionStore } from '../../stores'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, ScrollArea } from '../ui'

export type ResultsViewProps = {
  result: TranscriptionResult | null
}

export type SegmentListProps = {
  taskId: string
  segments: TranscriptSegment[]
}

export type SpeakerLegendProps = {
  taskId: string
  speakers: string[]
}

export type ExportPanelProps = {
  result: TranscriptionResult
}

function formatTime(seconds: number): string {
  return seconds.toFixed(1).padStart(4, '0')
}

function getDisplayName(taskId: string, speakerId: string, names: Record<string, Record<string, string>>): string {
  return names[taskId]?.[speakerId] ?? speakerId
}

function transcriptWithDisplayNames(result: TranscriptionResult, names: Record<string, Record<string, string>>): string {
  return result.segments
    .map((segment) => `[${formatTime(segment.start)}-${formatTime(segment.end)}] ${getDisplayName(result.task_id, segment.speaker, names)}: ${segment.text}`)
    .join('\n')
}

// START_CONTRACT: SegmentList
//   PURPOSE: Render only the visible transcript row window for large result sets.
//   INPUTS: { props: SegmentListProps - task id and backend transcript segments }
//   OUTPUTS: JSX.Element - virtualized segment list
//   SIDE_EFFECTS: measures scroll container with react-virtual
//   LINKS: M-RESULTS, V-M-RESULTS, M-STORES
// END_CONTRACT: SegmentList
export function SegmentList({ taskId, segments }: SegmentListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const speakerNames = useTranscriptionStore((state) => state.speakerNames)
  const viewportHeight = parentRef.current?.clientHeight || 480
  const rowVirtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 6
  })
  const virtualItems = rowVirtualizer.getVirtualItems()
  const visibleItems =
    virtualItems.length > 0
      ? virtualItems
      : Array.from({ length: Math.min(segments.length, Math.ceil(viewportHeight / 72) + 6) }, (_, index) => ({
          key: index,
          index,
          start: index * 72,
          size: 72
        }))

  return (
    <ScrollArea ref={parentRef} className="h-[480px] rounded-lg border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] dark:border-zinc-800 dark:bg-zinc-950" data-testid="segment-scroll">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
        {visibleItems.map((virtualRow) => {
          const segment = segments[virtualRow.index]

          if (!segment) {
            return null
          }

          return (
            <article
              key={virtualRow.key}
              data-testid="segment-row"
              className="absolute left-0 right-0 border-b border-[rgba(108,114,120,0.12)] p-4 text-sm dark:border-zinc-900"
              style={{ transform: `translateY(${virtualRow.start}px)`, height: `${virtualRow.size}px` }}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-[#6C7278]">
                <span>{formatTime(segment.start)}-{formatTime(segment.end)}</span>
                <strong className="text-[#1A1C1E] dark:text-zinc-100">{getDisplayName(taskId, segment.speaker, speakerNames)}</strong>
              </div>
              <p className="leading-relaxed text-[#1A1C1E] dark:text-zinc-100">{segment.text}</p>
            </article>
          )
        })}
      </div>
    </ScrollArea>
  )
}

// START_CONTRACT: SpeakerLegend
//   PURPOSE: Render speaker rename controls and persist display names by task id.
//   INPUTS: { props: SpeakerLegendProps - task id and unique speaker ids }
//   OUTPUTS: JSX.Element - editable speaker legend
//   SIDE_EFFECTS: updates M-STORES speakerNames
//   LINKS: M-RESULTS, V-M-RESULTS, M-STORES
// END_CONTRACT: SpeakerLegend
export function SpeakerLegend({ taskId, speakers }: SpeakerLegendProps) {
  const speakerNames = useTranscriptionStore((state) => state.speakerNames)
  const setSpeakerName = useTranscriptionStore((state) => state.setSpeakerName)

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6C7278]">Speaker map</p>
        <CardTitle>Спикеры</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {speakers.map((speaker) => (
          <div key={speaker} className="space-y-1">
            <Label htmlFor={`speaker-${speaker}`}>{speaker}</Label>
            <Input
              id={`speaker-${speaker}`}
              value={getDisplayName(taskId, speaker, speakerNames)}
              onChange={(event) => setSpeakerName(taskId, speaker, event.currentTarget.value)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

// START_CONTRACT: ExportPanel
//   PURPOSE: Render copy text and output-file links with speaker display names applied.
//   INPUTS: { props: ExportPanelProps - transcription result }
//   OUTPUTS: JSX.Element - export panel UI
//   SIDE_EFFECTS: writes transcript text to navigator.clipboard when available
//   LINKS: M-RESULTS, V-M-RESULTS, M-STORES
// END_CONTRACT: ExportPanel
export function ExportPanel({ result }: ExportPanelProps) {
  const speakerNames = useTranscriptionStore((state) => state.speakerNames)
  const [copied, setCopied] = useState(false)
  const copyText = transcriptWithDisplayNames(result, speakerNames)

  const copyTranscript = async () => {
    await navigator.clipboard?.writeText(copyText)
    setCopied(true)
  }

  return (
    <Card>
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6C7278]">Output</p>
        <CardTitle>Экспорт</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={copyTranscript}>Копировать transcript</Button>
        {copied ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">Скопировано</p> : null}
        <ul className="space-y-1 rounded-[4px] border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          {Object.entries(result.output_files).map(([format, path]) => (
            <li key={format}>
              <span className="font-medium uppercase">{format}</span>: {path}
            </li>
          ))}
        </ul>
        <pre className="max-h-40 overflow-auto rounded-[4px] bg-[#F7F5F2] p-3 text-xs dark:bg-zinc-950" data-testid="export-preview">
          {copyText}
        </pre>
      </CardContent>
    </Card>
  )
}

// START_CONTRACT: ResultsView
//   PURPOSE: Compose transcript result panels and apply store-backed speaker names to UI/export surfaces.
//   INPUTS: { props: ResultsViewProps - nullable backend transcription result }
//   OUTPUTS: JSX.Element - result workspace or empty state
//   SIDE_EFFECTS: none beyond child speaker/copy interactions
//   LINKS: M-RESULTS, V-M-RESULTS, M-API-CLIENT, M-STORES, M-UI
// END_CONTRACT: ResultsView
export function ResultsView({ result }: ResultsViewProps) {
  const speakers = useMemo(() => {
    if (!result) {
      return []
    }

    return Array.from(new Set(result.segments.map((segment) => segment.speaker))).sort()
  }, [result])

  if (!result) {
    return (
      <Card className="flex min-h-80 items-center justify-center">
        <CardContent className="p-8 text-center text-[#6C7278]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[4px] border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] text-2xl dark:bg-zinc-950">
            ¶
          </div>
          <p>Результаты появятся после завершения транскрибации.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-4">
        <div className="rounded-lg border border-[rgba(108,114,120,0.2)] bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6C7278]">Transcription complete</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-medium">{result.file_name}</h2>
              <p className="mt-1 text-sm text-[#6C7278]">{result.language} · {result.duration_sec.toFixed(1)} sec · {result.segments.length} segments</p>
            </div>
            <div className="rounded-[4px] border border-[rgba(108,114,120,0.2)] px-3 py-2 text-sm font-medium text-[#6C7278]">
              diarized transcript
            </div>
          </div>
        </div>
        <SegmentList taskId={result.task_id} segments={result.segments} />
      </section>
      <aside className="space-y-4 xl:self-start">
        <SpeakerLegend taskId={result.task_id} speakers={speakers} />
        <ExportPanel result={result} />
      </aside>
    </div>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - Reduced competing accents and tuned result surfaces to flat Heritage gallery cards.
//   LAST_CHANGE: v1.1.0 - Ported Figma result card styling, empty state, transcript canvas, and export action surfaces while keeping virtualization.
//   LAST_CHANGE: v1.0.0 - Implemented virtualized result display, speaker renaming, and export/copy panel.
// END_CHANGE_SUMMARY
