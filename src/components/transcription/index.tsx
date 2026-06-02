// FILE: src/components/transcription/index.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render transcription results with a virtualized segment list, speaker renaming, export links, and copy support.
//   SCOPE: Result display and speaker-name state orchestration; no backend mutation or filesystem writes.
//   DEPENDS: React, @tanstack/react-virtual, src/stores, src/shared, src/components/ui
//   LINKS: M-RESULTS, V-M-RESULTS, M-API-CLIENT, M-STORES, M-UI
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ResultsView - composed result view for transcript, speaker legend, and export panel.
//   SegmentList - virtualized transcript segment list.
//   SpeakerLegend - speaker rename controls backed by M-STORES.
//   ExportPanel - copy/export surface using display speaker names.
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
    <ScrollArea ref={parentRef} className="h-[480px] rounded-lg border border-zinc-200 dark:border-zinc-800" data-testid="segment-scroll">
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
              className="absolute left-0 right-0 border-b border-zinc-100 p-3 text-sm dark:border-zinc-900"
              style={{ transform: `translateY(${virtualRow.start}px)`, height: `${virtualRow.size}px` }}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                <span>{formatTime(segment.start)}-{formatTime(segment.end)}</span>
                <strong className="text-zinc-800 dark:text-zinc-100">{getDisplayName(taskId, segment.speaker, speakerNames)}</strong>
              </div>
              <p>{segment.text}</p>
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
        <CardTitle>Экспорт</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={copyTranscript}>Копировать transcript</Button>
        {copied ? <p role="status">Скопировано</p> : null}
        <ul className="space-y-1 text-sm">
          {Object.entries(result.output_files).map(([format, path]) => (
            <li key={format}>
              <span className="font-medium uppercase">{format}</span>: {path}
            </li>
          ))}
        </ul>
        <pre className="max-h-40 overflow-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900" data-testid="export-preview">
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
    return <p className="text-zinc-600 dark:text-zinc-400">Результаты появятся после завершения транскрибации.</p>
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">{result.file_name}</h2>
          <p className="text-sm text-zinc-500">{result.language} · {result.duration_sec.toFixed(1)} sec · {result.segments.length} segments</p>
        </div>
        <SegmentList taskId={result.task_id} segments={result.segments} />
      </section>
      <aside className="space-y-4">
        <SpeakerLegend taskId={result.task_id} speakers={speakers} />
        <ExportPanel result={result} />
      </aside>
    </div>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Implemented virtualized result display, speaker renaming, and export/copy panel.
// END_CHANGE_SUMMARY
