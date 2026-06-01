# Наследуемая архитектура из исходных проектов

**Проект:** WhisperAnnote
**Дата:** 2026-06-01
**Назначение:** Описать архитектурные артефакты, заимствуемые из Whisperer_v1, Whisperer_GUI и WhisperLiveKit

---

## 1. Источник: Whisperer_GUI

**Путь:** `H:\GitHub\Whisperer_GUI`
**Стек:** Python 3.12, PyQt5
**Размер кода:** ~370 строк (main.py 217 + worker.py 154)
**Роль в новом проекте:** Ядро ML-пайплайна (транскрибация + диаризация)

### 1.1 Пайплайн обработки (`worker.py`) — берём полностью

Файл содержит законченный, отлаженный и протестированный на русской речи конвейер из 5 шагов.
Границы компонента: 154 строки, класс `TranscribeWorker(QThread)`.

#### Шаг 1 — Аутентификация HuggingFace

```
worker.py:64-70

  from huggingface_hub import login
  from dotenv import load_dotenv

  HF_TOKEN = os.getenv("HUGGINGFACE_HUB_TOKEN")
  login(HF_TOKEN)

  os.environ["SPEECHBRAIN_LOCAL_STRATEGY"] = "COPY"
```

Назначение:
- Чтение HuggingFace-токена из `.env`
- Аутентификация для доступа к gated-моделям PyAnnote (`pyannote/speaker-diarization-3.1`)
- `SPEECHBRAIN_LOCAL_STRATEGY=COPY` — подавление загрузки речевых моделей из сети

Статус в новом проекте: Переносится в `backend/pipeline.py`, в инициализацию FastAPI-приложения (lifespan).

#### Шаг 2 — Аудио-конвертация (FFmpeg)

```
worker.py:30-50

  tmp = Path(self.file)
  wav = tmp.with_suffix(".wav")

  subprocess.run([
      "ffmpeg", "-y",
      "-i", str(tmp),
      "-ar", "16000",
      "-ac", "1",
      "-c:a", "pcm_s16le",
      str(wav)
  ], capture_output=True, text=True)

  # Определение длительности через wave
  with wave.open(str(wav), 'rb') as wf:
      frames = wf.getnframes()
      rate = wf.getframerate()
      self.duration = frames / float(rate)
      channels = wf.getnchannels()
```

Параметры конвертации:
| Параметр | Значение | Пояснение |
|----------|---------|-----------|
| `-ar` | 16000 | Частота дискретизации (Whisper требует 16kHz) |
| `-ac` | 1 | Моно (Whisper не использует стерео) |
| `-c:a` | pcm_s16le | 16-bit PCM (нативный формат Whisper) |
| `-y` | — | Перезапись без подтверждения |

Статус в новом проекте:
- Добавляется предварительный шаг: любой формат → MP3 (128kbps) перед извлечением WAV. Это стандартизирует входные данные.
- **Все промежуточные файлы (MP3, WAV) пишутся в системный temp**, а не рядом с исходником
  (в v1 `wav = tmp.with_suffix(".wav")` создавал файлы возле источника — для watched-папки это
  мусор и риск петли переобработки). Очистка в `finally`.
- Код переносится в `backend/pipeline.py`.

#### Шаг 3 — Диаризация (PyAnnote)

```
worker.py:72-85

  from pyannote.audio import Pipeline

  MODEL_ID = "pyannote/speaker-diarization-3.1"

  pipeline = Pipeline.from_pretrained(MODEL_ID)

  if self.device == "cuda":
      import torch
      pipeline.to(torch.device("cuda"))

  dia = pipeline({"audio": str(wav)})

  spk_segments = []
  for turn, _, speaker in dia.itertracks(yield_label=True):
      spk_segments.append({
          "start": turn.start,
          "end": turn.end,
          "speaker": speaker
      })

  def speaker_at(t):
      if not spk_segments:
          return "Speaker"
      for s in spk_segments:
          if s["start"] <= t <= s["end"]:
              return s["speaker"]
      return "unknown"
```

Архитектурные детали:
- Диаризация запускается на **полном аудиофайле** (не чанками) — это даёт глобальный контекст и лучшую точность
- Результат — массив `[{start, end, speaker}]`, где `speaker` типа `"SPEAKER_00"`
- Функция `speaker_at(t)` — O(n) lookup для определения спикера в конкретный момент времени. Используется на шаге 5
- Модель может быть перемещена на GPU через `pipeline.to(device)`

Статус в новом проекте:
- Переносится без изменений в `backend/pipeline.py`
- Модель PyAnnote загружается один раз при старте сервера, живёт в глобальной переменной
- При смене `device` (GPU ↔ CPU) — перезагрузка модели

#### Шаг 4 — Чанкованная транскрибация (Whisper)

```
worker.py:88-126

  CHUNK_SECONDS = 300  # 5 минут

  import whisper
  model = whisper.load_model(self.model)
  if self.device == "cuda":
      model = model.to("cuda")

  n_chunks = int(self.duration / CHUNK_SECONDS) + 1

  for i in range(n_chunks):
      start = i * CHUNK_SECONDS
      chunk_wav = tmp.with_name(f"{tmp.stem}_chunk_{i}.wav")

      subprocess.run([
          "ffmpeg", "-y",
          "-i", str(wav),
          "-ss", str(start),
          "-t", str(CHUNK_SECONDS),
          "-ar", "16000",
          "-ac", "1",
          "-c:a", "pcm_s16le",
          str(chunk_wav)
      ], capture_output=True)

      result = model.transcribe(str(chunk_wav), language="ru")

      for seg in result["segments"]:
          seg["start"] += start    # коррекция таймстемпов
          seg["end"] += start
```

Архитектурные детали:
- **Размер чанка:** 300 секунд (5 минут). Эмпирически оптимально для Whisper — укладывается в контекстное окно модели и не вызывает OOM на GPU с 4-6 GB VRAM
- **Чанкинг через FFmpeg:** Каждый чанк извлекается из WAV командой `ffmpeg -ss ... -t ...`. Это быстро (seek вместо перекодирования) и дёшево
- **Коррекция таймстемпов:** Whisper выдаёт таймстемпы относительно начала чанка. `seg["start"] += start` приводит к глобальным таймстемпам
- **Overlap между чанками не используется** — в worker.py нет перекрытия. Для русского языка это допустимо, потери на границах минимальны
- **Язык захардкожен как `"ru"`** — в новом проекте станет параметром

Статус в новом проекте (СУЩЕСТВЕННО ИЗМЕНЁН):
- **Ручной чанкинг по 300 сек убирается.** Он был воркэраундом под `openai-whisper`, который
  грузил весь mel-спектр в память и плохо справлялся с длинными файлами. `faster-whisper`
  обрабатывает файл любой длины нативно (внутренние 30-сек окна + встроенный VAD), поэтому
  жёсткая нарезка по словам каждые 5 минут больше не нужна и вредна для качества на границах.
- **API faster-whisper ОТЛИЧАЕТСЯ** от openai-whisper (это НЕ «тот же API»):
  `segments, info = model.transcribe(wav, language="ru", vad_filter=True)`, где `segments` —
  генератор объектов `Segment` (а не `result["segments"]`). Перебираем генератор, по ходу
  обновляем прогресс и проверяем флаг отмены (кооперативная отмена между сегментами).
- `confidence` вычисляется как `exp(seg.avg_logprob)`.
- Язык настраиваемый (по умолчанию `ru`); устройство всегда CUDA (GPU).
- Код переносится в `backend/pipeline.py`.

#### Шаг 5 — Сопоставление спикеров (Alignment)

```
worker.py:128-137

  for seg in result["segments"]:
      midpoint = (seg["start"] + seg["end"]) / 2.0
      speaker = speaker_at(midpoint)

      entry = {
          "speaker": speaker,
          "start": round(seg["start"], 3),
          "end": round(seg["end"], 3),
          "text": seg["text"].strip()
      }
      json_entries.append(entry)

      ts = format_timestamp(seg["start"])
      txt_lines.append(f"[{ts}] {speaker}: {seg['text'].strip()}")
```

Алгоритм сопоставления:
1. Для каждого текстового сегмента вычисляется **средняя точка** `midpoint = (start + end) / 2`
2. Вызов `speaker_at(midpoint)` находит спикера, чей диаризационный интервал содержит эту точку
3. Спикер присваивается сегменту

**Почему в v1 была средняя точка, а не overlap?**
Простота и скорость. Но overlap-based подход (какой спикер занимает большую часть сегмента) точнее
на границах и при перекрёстной речи — а именно перекрёстная речь является доминирующим источником
ошибок на совещаниях. Поэтому в v2 выбран max-overlap (см. «Статус в новом проекте» ниже).

Статус в новом проекте (ИЗМЕНЁН): midpoint заменяется на **max-overlap** — спикер выбирается по
максимальному перекрытию длительности текстового сегмента с диаризационными интервалами
(устойчивее к перекрёстной речи). Единый fallback-лейбл `UNKNOWN` при отсутствии пересечений.

#### Шаг 6 — Форматирование вывода

```
worker.py:140-148

  # JSON
  with open(f"{name}.json", "w", encoding="utf-8") as f:
      json.dump(json_entries, f, ensure_ascii=False, indent=2)

  # TXT
  with open(f"{name}.txt", "w", encoding="utf-8") as f:
      f.write("\n".join(txt_lines))

  # SRT
  with open(f"{name}.srt", "w", encoding="utf-8") as f:
      for i, seg in enumerate(json_entries, 1):
          f.write(f"{i}\n")
          f.write(f"{srt_time(seg['start'])} --> {srt_time(seg['end'])}\n")
          f.write(f"{seg['speaker']}: {seg['text']}\n\n")

  # MD (копия TXT)
  with open(f"{name}.md", "w", encoding="utf-8") as f:
      f.write("\n".join(txt_lines))
```

Форматы и их содержимое:
| Формат | Структура | Пример |
|--------|-----------|--------|
| JSON | `[{speaker, start, end, text}]` | `{"speaker": "SPEAKER_00", "start": 1.5, "end": 3.2, "text": "Добрый день"}` |
| TXT | `[HH:MM:SS.mmm] SPEAKER: text` | `[00:00:01.500] SPEAKER_00: Добрый день` |
| SRT | Стандартный SubRip с speaker-меткой | `1\n00:00:01,500 --> 00:00:03,200\nSPEAKER_00: Добрый день\n` |
| MD | Идентичен TXT | — |

Статус в новом проекте:
- Добавляется **DOCX** (python-docx) как дополнительный формат
- MD как отдельный формат убирается (дублирует TXT)
- Форматирование выносится в `backend/formatters.py`

### 1.2 GUI-компоненты (`main.py`) — НЕ берём

`main.py` содержит:
- `TitleBar` (frameless custom title bar, 36 строк) — заменяется на нативный Electron frameless window
- `MainWindow` (PyQt5 QWidget, 155 строк) — полностью заменяется на React + shadcn
- Dark theme stylesheet (CSS-строка) — заменяется на Tailwind dark theme

**Ничего из main.py не переносится.** Вся GUI-логика пишется заново на React.

### 1.3 Что именно адаптируется из worker.py

| Исходный код | Куда в новом проекте | Изменения |
|-------------|---------------------|-----------|
| `worker.py:30-50` (FFmpeg WAV) | `backend/pipeline.py` | + конвертация в MP3; все temp-файлы в системный temp, очистка в `finally` |
| `worker.py:64-70` (HF auth) | `backend/server.py` lifespan | Токен из env (secure store), не из `.env` в проде |
| `worker.py:72-85` (диаризация) | `backend/pipeline.py` | asyncio.to_thread; опц. `num_speakers` |
| `worker.py:88-126` (транскрибация) | `backend/pipeline.py` | **Чанкинг убран**; faster-whisper нативно; API иной (генератор `Segment`) |
| `worker.py:128-137` (alignment) | `backend/pipeline.py` | **midpoint → max-overlap**, fallback `UNKNOWN` |
| `worker.py:140-148` (форматирование) | `backend/formatters.py` | + DOCX, убирается MD; применяются имена спикеров из UI |
| `worker.py:19-28` (инициализация) | `backend/pipeline.py` | Переход на Pydantic-модели вместо dict |
| `worker.py:53-62` (отмена/stoppable) | `backend/pipeline.py` | asyncio.Event вместо `_stop` флага |
| `worker.py:75,87,113,151` (логи) | `backend/websocket_manager.py` | Эмит сигналов → WebSocket broadcast |

---

## 2. Источник: Whisperer_v1

**Путь:** `H:\GitHub\Whisperer_v1`
**Стек:** Flask + React (TypeScript, Vite, Tailwind, shadcn/ui)
**Размер кода:** ~600 строк React + ~200 строк Python
**Роль в новом проекте:** React UI-компоненты и интернационализация

### 2.1 React-компоненты (`Transcription Studio Interface/src/`)

Берём следующую структуру компонентов и адаптируем:

```
Transcription Studio Interface/src/
├── App.tsx                         ← Адаптируется в src/App.tsx (layout)
├── main.tsx                        ← Адаптируется в src/main.tsx (React entry)
├── index.css                       ← Берём целиком (Tailwind + тема)
├── components/
│   ├── FileUpload.tsx              ← Становится upload/DropZone.tsx
│   ├── QuickSettings.tsx           ← Становится upload/QuickSettings.tsx
│   ├── AdvancedSettings.tsx        ← Становится settings/ModelSettings.tsx
│   ├── ResultsZone.tsx             ← Становится transcription/SegmentList.tsx
│   ├── FloatingControls.tsx        ← Распределяется по другим компонентам
│   ├── Header.tsx                  ← Становится layout/Header.tsx
│   └── ui/                         ← 12-15 востребованных компонентов
│       ├── button.tsx              ← Берём
│       ├── card.tsx                ← Берём
│       ├── dropdown-menu.tsx       ← Берём
│       ├── input.tsx               ← Берём
│       ├── select.tsx              ← Берём (замена QuickSettings)
│       ├── switch.tsx              ← Берём (вкл/выкл batch)
│       ├── tabs.tsx                ← Берём (навигация)
│       ├── tooltip.tsx             ← Берём (подсказки)
│       ├── badge.tsx               ← Берём (статусы)
│       ├── dialog.tsx              ← Берём (модальные окна)
│       ├── progress.tsx            ← Берём (прогресс транскрибации)
│       ├── scroll-area.tsx         ← Берём
│       ├── separator.tsx           ← Берём
│       ├── table.tsx               ← Берём (история)
│       ├── toast.tsx               ← Берём (уведомления)
│       └── slider.tsx              ← Берём
│
│   НЕ берём (~32 компонента):
│   ├── accordion, alert, alert-dialog, aspect-ratio, avatar,
│   │   breadcrumb, calendar, carousel, chart, checkbox,
│   │   collapsible, command, context-menu, drawer, form,
│   │   hover-card, input-otp, label, menubar, navigation-menu,
│   │   pagination, popover, radio-group, resizable,
│   │   sheet, skeleton, sonner, textarea, toggle, toggle-group
```

### 2.2 UI-паттерны и тема (Tailwind)

Из `index.css` берём:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    /* ... все CSS-переменные shadcn */
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... */
  }
}
```

Из `tailwind.config.js` берём:
```javascript
// shadcn/ui стандартная конфигурация:
// - darkMode: "class"
// - content paths
// - extend с цветами, border-radius, keyframes
```

Эти файлы адаптируются под новую структуру, сохраняя ту же цветовую схему и конфигурацию.

### 2.3 Интернационализация (`locales/`)

Исходные файлы:
```
locales/
├── ru/messages.json    ← Берём, основной язык
├── en/messages.json    ← Берём, fallback
├── de/messages.json    ← НЕ берём
├── es/messages.json    ← НЕ берём
└── fr/messages.json    ← НЕ берём
```

**Формат переводов (Whisperer_v1):**
```json
{
  "app.title": "Whisperer Transcription Studio",
  "button.transcribe": "Расшифровать",
  "settings.model": "Модель",
  "settings.device": "Устройство",
  "progress.loading_model": "Загрузка модели..."
}
```

**Адаптация:** Переводы переносятся в формат `react-i18next`:
```json
// src/i18n/locales/ru/translation.json
{
  "app": {
    "title": "WhisperAnnote",
    "slogan": "Транскрибация и диаризация русской речи"
  },
  "transcribe": {
    "title": "Транскрибация",
    "dropzone": "Перетащите файлы сюда или нажмите для выбора",
    "button": "Расшифровать",
    "cancel": "Отмена"
  },
  "settings": {
    "model": "Модель",
    "device": "Устройство",
    "gpu": "GPU (CUDA)",
    "cpu": "CPU"
  },
  "batch": {
    "title": "Мониторинг папки",
    "watchFolder": "Папка для отслеживания",
    "cronExpression": "Расписание (cron)",
    "enabled": "Автообработка включена"
  }
}
```

### 2.4 Python-код (НЕ берём)

- `api_server.py` — Flask без диаризации, заменяется на FastAPI
- `archive/api_server_original.py` — только для справки (диаризация + асинхронные задачи)
- `run.py` — лаунчер, заменяется на Electron main process
- `config.py` — JSON-конфигурация, заменяется electron-store
- `i18n.py` — серверная i18n, заменяется react-i18next

**Система асинхронных задач** из `archive/api_server_original.py` (lines 180-380) содержит интересный паттерн:
- Класс `TranscriptionTask` с состояниями: `pending → processing → completed/cancelled/error`
- Thread-based выполнение с `current_stage` и `progress_percent`
- Web-интерфейс с SSE (Server-Sent Events) для стриминга прогресса

Этот паттерн будет воспроизведён в новом проекте, но:
- Вместо потоков — `asyncio` задачи
- Вместо SSE — WebSocket
- Вместо глобального `tasks` dict — `asyncio.Queue` + `dict`
- Состояния расширены: `queued → converting → diarizing → transcribing → formatting → completed`

---

## 3. Источник: WhisperLiveKit

**Путь:** `H:\GitHub\WhisperLiveKit`
**Стек:** FastAPI + WebSocket + HTML/JS
**Размер кода:** ~2500 строк Python
**Роль в новом проекте:** Архитектурные паттерны, FastAPI-сервер, VAD

### 3.1 FastAPI-сервер (`basic_server.py`) — паттерн

```
basic_server.py:1-134

  from fastapi import FastAPI, WebSocket
  from fastapi.middleware.cors import CORSMiddleware

  app = FastAPI()

  app.add_middleware(CORSMiddleware, allow_origins=["*"], ...)

  @app.websocket("/asr")
  async def asr_websocket(ws: WebSocket):
      await ws.accept()
      audio_processor = AudioProcessor(...)
      try:
          while True:
              data = await ws.receive()
              # ... process audio chunks
      except WebSocketDisconnect:
          pass
      finally:
          await audio_processor.cleanup()

  if __name__ == "__main__":
      import uvicorn
      uvicorn.run(app, host="0.0.0.0", port=8000)
```

Что заимствуем:
- Структура FastAPI-приложения (lifespan, middleware, WebSocket)
- CORS middleware для Electron renderer → Python backend
- Запуск через uvicorn из кода, а не командной строки

Что НЕ заимствуем:
- WebSocket для аудио-потока (нам не нужен стриминг микрофона)
- Конкретный эндпоинт `/asr` (у нас `/ws/progress/{task_id}` для прогресса)

### 3.2 WebSocket-паттерн для прогресса

В WhisperLiveKit WebSocket используется для двусторонней потоковой передачи аудио/транскриптов.
В WhisperAnnote WebSocket будет использоваться **только для стриминга прогресса** от сервера к клиенту:

```
backend/websocket_manager.py (новая разработка, вдохновлённая WhisperLiveKit)

  from fastapi import WebSocket

  class ProgressManager:
      _connections: dict[str, WebSocket]  # task_id → WebSocket

      async def connect(self, task_id: str, ws: WebSocket):
          await ws.accept()
          self._connections[task_id] = ws

      async def disconnect(self, task_id: str):
          self._connections.pop(task_id, None)

      async def send_progress(self, task_id: str, data: dict):
          ws = self._connections.get(task_id)
          if ws:
              await ws.send_json(data)
```

Паттерн взят из WhisperLiveKit `audio_processor.py:420-460` (вещание результатов через WebSocket), но упрощён до однонаправленного.

### 3.3 VAD (Silero) — опционально

```
silero_vad_iterator.py:1-163

  import torch

  class FixedVADIterator:
      def __init__(self, threshold=0.5, min_silence_duration_ms=300, ...):
          self.model, _ = torch.hub.load(
              repo_or_dir='snakers4/silero-vad',
              model='silero_vad'
          )

      def __call__(self, audio_chunk, return_seconds=False):
          # возвращает: speech_start, speech_end (или None если тишина)
          ...
```

Что заимствуем:
- Silero VAD-модель — лёгкая, точная, работает без GPU
- Класс `FixedVADIterator` с адаптивным порогом и минимальной длительностью тишины

> **Важно:** базовый VAD **уже встроен** в faster-whisper (`vad_filter=True`, тот же Silero под
> капотом). Отдельный порт `silero_vad_iterator.py` для основного пайплайна **не требуется**.

Использование в WhisperAnnote (этап 2+, не блокирующее, только если понадобится отдельная пред-сегментация перед диаризацией):
- Предварительная сегментация аудио перед диаризацией (убрать длинные паузы)
- Улучшение качества на записях с тишиной между спикерами
- Импорт: `backend/vad.py` (адаптировано из `silero_vad_iterator.py`)

### 3.4 Типы данных (`timed_objects.py`)

```
timed_objects.py:1-36

  from dataclasses import dataclass
  from typing import Optional

  @dataclass
  class ASRToken:
      start: float
      end: float
      text: str
      p: float  # probability

  @dataclass
  class Sentence:
      start: float
      end: float
      text: str

  @dataclass
  class Transcript:
      segments: list

  @dataclass
  class SpeakerSegment:
      start: float
      end: float
      speaker: str
```

Адаптация в WhisperAnnote:
- Эти датаклассы становятся Pydantic-моделями в `backend/models.py`
- `ASRToken` → не используется (токен-уровень не нужен без стриминга)
- `Sentence` → `TranscriptSegment` (наша основная единица)
- `SpeakerSegment` → используется в том же виде для диаризации
- `Transcript` → `TranscriptionResult`

### 3.5 Что НЕ берём

| Компонент | Причина |
|-----------|---------|
| **`simul_whisper/`** (671 строк) | Dual-license (PolyForm Noncommercial 1.0.0). Стриминг не нужен |
| **`whisper_streaming_custom/`** (412 строк) | Альтернативный стриминг-бэкенд. Стриминг не нужен |
| **`audio_processor.py`** (620 строк) | Оркестратор на одно WebSocket-соединение. Архитектура для стриминга микрофона |
| **`ffmpeg_manager.py`** (193 строки) | Управление FFmpeg-подпроцессами для стриминга. Нам нужны обычные `subprocess.run` |
| **`core.py`** (169 строк) | TranscriptionEngine как синглтон. Слишком привязан к стримингу |
| **`remove_silences.py`** (110 строк) | Обработка тишины для стриминга. Частично адаптируем паттерн |
| **`results_formater.py`** (138 строк) | Форматирование для стримингового фронтенда |
| **`trail_repetition.py`** | Обнаружение повторов — стриминговая фича |
| **`warmup.py`** | Прогрев моделей для стриминга |
| **`diarization/diart_backend.py`** | Альтернативный бэкенд диаризации (Diart) |
| **`diarization/sortformer_backend.py`** | Sortformer — требует `nemo_toolkit` (тяжёлая зависимость, ~2 GB) |
| **`web/`** | HTML/JS/CSS фронтенд для браузера |
| **`parse_args.py`** (277 строк) | CLI-аргументы. Не нужны для десктоп-приложения с конфигом |
| **`Dockerfile`, `Dockerfile.cpu`** | Контейнеризация не нужна для десктопа |

---

## 4. Сводная карта заимствований

```
                    Whisperer_GUI        Whisperer_v1         WhisperLiveKit
                         │                    │                    │
                         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         WhisperAnnote                               │
│                                                                     │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  backend/        │  │  src/             │  │  backend/          │  │
│  │  pipeline.py     │  │  components/      │  │  server.py         │  │
│  │  ← worker.py     │  │  ← shadcn/ui      │  │  ← basic_server.py │  │
│  │  ★ Шаги 1-5      │  │  ★ 15 компонентов │  │  ★ FastAPI паттерн │  │
│  │  ★ Диаризация    │  │  ★ Tailwind тема  │  │  websocket_manager │  │
│  │  ★ Чанкинг 5мин  │  │                   │  │  ← WS паттерн      │  │
│  │  ★ Alignment     │  │  locales/ru/      │  │                    │  │
│  │                   │  │  ← messages.json │  │  vad.py             │  │
│  │  formatters.py    │  │  ★ Переводы       │  │  ← silero_vad_...  │  │
│  │  ← worker.py шаг 6│  │                   │  │  ★ Silero VAD      │  │
│  │  ★ JSON/TXT/SRT   │  │                   │  │                    │  │
│  │  ★ +DOCX          │  │                   │  │  models.py          │  │
│  └─────────────────┘  └──────────────────┘  │  ← timed_objects.py │  │
│                                              │  ★ Pydantic модели  │  │
│                                              └───────────────────┘  │
│                                                                     │
│  electron/          ← НОВАЯ РАЗРАБОТКА                              │
│  ├── main.ts                                                         │
│  ├── python-manager.ts                                               │
│  ├── file-watcher.ts  ← концепция из требований пользователя          │
│  └── scheduler.ts     ← концепция из требований пользователя          │
│                                                                     │
│  src/stores/, src/hooks/  ← НОВАЯ РАЗРАБОТКА                        │
│  src/components/batch/    ← НОВАЯ РАЗРАБОТКА                        │
│  src/components/layout/   ← НОВАЯ РАЗРАБОТКА                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Количественная оценка переиспользования

| Категория | Строк кода | Из какого проекта | % кода |
|-----------|-----------|-------------------|--------|
| ML-пайплайн (транскрибация + диаризация) | ~120 | Whisperer_GUI worker.py | 80% переиспользуется |
| React UI-компоненты | ~800 | Whisperer_v1 UI | 30% переиспользуется (15 из 48) |
| Tailwind + тема | ~100 | Whisperer_v1 index.css | 90% переиспользуется |
| Локализация (ru) | ~50 | Whisperer_v1 locales | 80% переиспользуется (адаптация формата) |
| FastAPI-сервер | ~50 | WhisperLiveKit basic_server.py | Паттерн, не код |
| WebSocket-менеджер | ~30 | WhisperLiveKit ws-паттерн | Паттерн, не код |
| VAD (Silero) | ~60 | WhisperLiveKit silero_vad_iterator | 70% переиспользуется |
| Pydantic-модели | ~30 | WhisperLiveKit timed_objects | Структура, не код |
| **Electron main process** | ~300 | Новая разработка | 0% |
| **Batch queue** | ~150 | Новая разработка | 0% |
| **Новые UI-секции** | ~400 | Новая разработка | 0% |
| **Итого** | **~2090** | **~1240 переиспользуется / ~850 новое** | **~60/40** |

---

## 5. Ключевые архитектурные решения, переходящие из исходных проектов

### 5.1 Из Whisperer_GUI

- **Диаризация на полном аудио** (не чанками) — глобальный контекст даёт лучшую точность
- ~~Чанкинг по 300 секунд~~ — **убран в v2** (был воркэраундом под openai-whisper; faster-whisper обрабатывает длинные файлы нативно)
- ~~Midpoint alignment~~ → **max-overlap alignment** в v2 (точнее на границах и при перекрытии речи)
- **SPEECHBRAIN_LOCAL_STRATEGY=COPY** — подавление сетевых загрузок при использовании PyAnnote

### 5.2 Из Whisperer_v1

- **shadcn/ui компонентная модель** — каждый UI-компонент как отдельный файл
- **CSS-переменные для тем** — `:root` и `.dark` классы для светлой/тёмной темы
- **Ключевая структура переводов** — интерфейс переводится через JSON-файлы

### 5.3 Из WhisperLiveKit

- **lifespan FastAPI** — загрузка моделей при старте приложения, выгрузка при остановке
- **WebSocket для стриминга состояния** — от сервера к клиенту, однонаправленно
- **Silero VAD** — как опциональный модуль для улучшения сегментации
