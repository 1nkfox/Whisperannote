// FILE: src/shared/dto.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Mirror backend Pydantic DTOs for renderer and Electron main TypeScript code.
//   SCOPE: Stable DTO types from backend/models.py with backend snake_case fields preserved.
//   DEPENDS: none
//   LINKS: M-SHARED, M-SCHEMAS, V-M-SHARED, backend/models.py
//   ROLE: TYPES
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   ErrorCode - stable backend error-code union.
//   SpeakerSegment - diarization interval mirror.
//   TranscriptSegment - aligned transcript segment mirror.
//   TranscriptionResult - backend transcription result mirror.
//   TaskStatus / TaskInfo / TranscribeJob - queue and request DTO mirrors.
//   HealthStatus / AvailableModels - backend health and model-registry response mirrors.
//   WSMessage - backend WebSocket progress-message discriminated union.
// END_MODULE_MAP

export type ErrorCode =
  | 'MISSING_SECRET_TOKEN'
  | 'UNAUTHORIZED'
  | 'FFMPEG_NOT_FOUND'
  | 'PATH_NOT_ALLOWED'
  | 'CONVERSION_FAILED'
  | 'CUDA_UNAVAILABLE'
  | 'HF_AUTH_FAILED'
  | 'MODEL_NOT_LOADED'
  | 'MODEL_DOWNLOAD_FAILED'
  | 'CANCELLED'
  | 'PIPELINE_FAILED'
  | 'QUEUE_FULL'

export type SpeakerSegment = {
  start: number
  end: number
  speaker: string
}

export type TranscriptSegment = {
  speaker: string
  start: number
  end: number
  text: string
  confidence: number | null
}

export type TranscriptionResult = {
  task_id: string
  file_name: string
  language: string
  duration_sec: number
  segments: TranscriptSegment[]
  full_text: string
  speaker_names: Record<string, string>
  output_files: Record<string, string>
}

export type TaskStatus =
  | 'queued'
  | 'converting'
  | 'diarizing'
  | 'transcribing'
  | 'formatting'
  | 'completed'
  | 'error'
  | 'cancelled'

export type TaskInfo = {
  task_id: string
  file_path: string
  file_name: string
  status: TaskStatus
  progress_percent: number
  queue_position: number
  created_at: string
  error_message: string | null
  result: TranscriptionResult | null
}

export type TranscribeJob = {
  task_id: string
  file_path: string
  output_dir: string
  model: string
  language: string
  num_speakers: number | null
  output_formats: string[]
  speaker_names: Record<string, string>
}

export type HealthStatus = {
  status: string
  python_version: string
  cuda_available: boolean
  cuda_devices: number
  whisper_ready: boolean
  pyannote_ready: boolean
  models_cached: string[]
}

export type AvailableModels = {
  available: string[]
  downloaded: string[]
  current: string
}

export type WSMessage =
  | { type: 'stage'; stage: string }
  | { type: 'progress'; percent: number; message?: string }
  | { type: 'log'; message: string }
  | { type: 'complete'; output_files: Record<string, string>; duration_sec: number }
  | { type: 'error'; message: string }
