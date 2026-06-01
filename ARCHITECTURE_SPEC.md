# WhisperAnnote — Спецификация архитектуры

**Дата:** 2026-06-01
**Версия:** 1.0
**Назначение:** Передать агенту-архитектору для проработки плана реализации

---

## 1. Оглавление

- [2. Краткое описание продукта](#2-краткое-описание-продукта)
- [3. Бизнес-требования](#3-бизнес-требования)
- [4. Исходные проекты (аудит)](#4-исходные-проекты-аудит)
- [5. Что берём и что выкидываем](#5-что-берём-и-что-выкидываем)
- [6. Модели машинного обучения](#6-модели-машинного-обучения)
- [7. Архитектура системы](#7-архитектура-системы)
- [8. Стек технологий](#8-стек-технологий)
- [9. Структура проекта](#9-структура-проекта)
- [10. Компоненты детально](#10-компоненты-детально)
- [11. Пайплайн обработки аудио](#11-пайплайн-обработки-аудио)
- [12. API-контракты](#12-api-контракты)
- [13. Состояния и потоки данных](#13-состояния-и-потоки-данных)
- [14. Конфигурация и настройки](#14-конфигурация-и-настройки)
- [15. Автообработка папки](#15-автообработка-папки)
- [16. План реализации (этапы)](#16-план-реализации-этапы)
- [17. История обсуждения (полный чат)](#17-история-обсуждения-полный-чат)

---

## 2. Краткое описание продукта

**WhisperAnnote** — десктопное приложение (Electron) для транскрибации аудио/видео записей совещаний на **русском языке** с автоматической **диаризацией** (определением говорящих).

**Ключевые сценарии:**
1. **Ручная обработка** — пользователь перетаскивает файл(ы) в окно, выбирает модель, запускает транскрибацию, получает результат
2. **Автообработка папки** — приложение следит за указанной папкой. При появлении нового файла (или по cron-расписанию) автоматически запускается конвейер: любой формат → конвертация в MP3 → транскрибация + диаризация → сохранение результата

**Целевая аудитория:** русскоговорящие пользователи, записывающие совещания, интервью, конференции.

**Интерфейс:** современный, вдохновлён Vercel-дизайном (shadcn/ui, Radix, Tailwind), с поддержкой светлой и тёмной темы.

---

## 3. Бизнес-требования

| ID | Требование | Приоритет |
|----|-----------|-----------|
| BR-01 | Транскрибация аудио/видео на русском языке | P0 |
| BR-02 | Диаризация — определение кто говорит в каждый момент | P0 |
| BR-03 | Ручная загрузка файлов через drag-and-drop и file picker | P0 |
| BR-04 | Автообработка файлов из указанной папки | P1 |
| BR-05 | Конвертация любых аудио/видео форматов в MP3 перед обработкой | P0 |
| BR-06 | Выбор модели Whisper (medium/large-v3/large-v3-turbo) | P0 |
| BR-07 | Выбор устройства выполнения: GPU (CUDA) или CPU | P0 |
| BR-08 | Прогресс обработки в реальном времени | P0 |
| BR-09 | Экспорт результатов: TXT, SRT, JSON, DOCX | P1 |
| BR-10 | Копирование транскрипта в буфер обмена | P1 |
| BR-11 | Русскоязычный интерфейс (с возможностью EN) | P0 |
| BR-12 | Тёмная и светлая тема | P1 |
| BR-13 | Настройка cron-расписания для автообработки папки | P2 |
| BR-14 | Сохранение прогресса при сбое (resume) | P2 |
| BR-15 | Отображение истории обработанных файлов | P1 |

---

## 4. Исходные проекты (аудит)

Проанализированы три репозитория пользователя `H:\GitHub\`:

### 4.1 Whisperer_v1

**Стек:** Flask + React (TypeScript, shadcn/ui, Tailwind, Radix UI)
**Назначение:** Полноценная веб-студия транскрибации
**Компоненты:**
- `api_server.py` (182 строки) — Flask REST API с единственным эндпоинтом `/api/transcribe`. Только транскрибация Whisper, диаризация вырезана
- `archive/api_server_original.py` (511 строк) — Изначальная версия с полной поддержкой диаризации (PyAnnote), чанкованной обработкой (5 мин), асинхронными задачами и отменой. НЕАКТУАЛЬНО — используется для справки
- `Transcription Studio Interface/` — React-фронтенд на Vite с shadcn/ui компонентами, Tailwind, drag-and-drop загрузкой, настройками модели
- `static/index.html` — запасной HTML-интерфейс (не нужен)
- `locales/` — переводы на 5 языков включая русский
- `i18n.py` — серверная система переводов
- `config.py` — JSON-конфигурация языка интерфейса
- `run.py` (251 строка) — Лаунчер с SSE-стримингом прогресса (заменяется Electron)
- `Interface v2/` — Альтернативный React-фронтенд (не нужен)
- `requirements.txt` — зависимости Python
- `Dockerfile`, `docker-compose.yml` — контейнеризация (не нужна для десктопа)

### 4.2 Whisperer_GUI

**Стек:** PyQt5 (Python desktop GUI)
**Назначение:** Простая GUI-обёртка над Whisper + PyAnnote
**Компоненты:**
- `main.py` (217 строк) — PyQt5-окно с frameless title bar, file picker, выбором модели (large-v3/large-v3-turbo), устройства (GPU/CPU), логом и прогресс-баром
- `worker.py` (154 строки) — **САМЫЙ ЦЕННЫЙ АРТЕФАКТ.** QThread-воркер с полным пайплайном:
  - FFmpeg: извлечение WAV (16kHz mono PCM)
  - PyAnnote: диаризация спикеров (`pyannote/speaker-diarization-3.1`)
  - Whisper: транскрибация чанками по 300 секунд (5 мин)
  - Сопоставление сегментов со спикерами по средней точке таймстемпа
  - Вывод: JSON, TXT, SRT, MD
  - Поддержка остановки (флаг `_stop`)
- `requirements.txt` — зависимости (torch, openai-whisper, pyannote.audio, PyQt5)
- `.env` — HuggingFace токен для доступа к gated-моделям PyAnnote

### 4.3 WhisperLiveKit

**Стек:** FastAPI + WebSocket + HTML/JS фронтенд
**Назначение:** Стриминговая транскрибация в реальном времени с диаризацией
**Компоненты:**
- `whisperlivekit/` — Python-пакет
- `core.py` — TranscriptionEngine (синглтон, инициализирует ASR + VAD + диаризацию)
- `audio_processor.py` (620 строк) — Оркестратор на одно WebSocket-соединение, 4 асинхронные задачи
- `basic_server.py` (134 строки) — FastAPI-сервер с WebSocket `/asr` и HTML-фронтендом
- `ffmpeg_manager.py` — Управление FFmpeg-подпроцессами
- `simul_whisper/` — **ВАЖНО:** Dual-license (MIT + PolyForm Noncommercial). Стриминг не нужен — выкидываем
- `whisper_streaming_custom/` — Альтернативный стриминг-бэкенд. Тоже не нужен
- `diarization/sortformer_backend.py` — Требует `nemo_toolkit` (тяжёлая зависимость). PyAnnote проще
- `diarization/diart_backend.py` — Альтернатива PyAnnote. Не используется
- `remove_silences.py`, `silero_vad_iterator.py` — VAD на базе Silero (полезно, можно адаптировать)
- `results_formater.py` — Форматирование результатов для фронтенда
- `timed_objects.py` — Датаклассы ASRToken, Sentence, Transcript и т.д.
- `web/` — HTML/JS фронтенд (не нужен, заменяется Electron)
- `pyproject.toml` — Зависимости и точка входа CLI

---

## 5. Что берём и что выкидываем

### 5.1 Берём (повторно используем)

| Артефакт | Откуда | Почему |
|----------|--------|--------|
| **`worker.py` (полностью)** | Whisperer_GUI | Готовый, отлаженный пайплайн транскрибации + диаризации для русского языка. 154 строки чистого кода |
| **React-компоненты shadcn/ui** | Whisperer_v1 / Transcription Studio Interface | 48 врапперов shadcn/ui + кастомные компоненты (FileUpload, AdvancedSettings, ResultsZone, Header, FloatingControls) |
| **Tailwind-конфигурация и тема** | Whisperer_v1 | tailwind.config.js, index.css с кастомными переменными |
| **Локализация `locales/ru/`** | Whisperer_v1 | Готовые русские переводы UI-строк |
| **Система i18n** | Whisperer_v1 | Адаптировать `i18n.py` → TypeScript (react-i18next или next-intl) |
| **Форматы вывода** | Whisperer_v1 + Whisperer_GUI | JSON, TXT, SRT, VTT, CSV — логика форматирования из archive/api_server_original.py и worker.py |
| **VAD (Silero)** | WhisperLiveKit | `silero_vad_iterator.py` — может пригодиться для сегментации тишины в будущем |
| **Датаклассы** | WhisperLiveKit | `timed_objects.py` — ASRToken, Sentence, Transcript, SpeakerSegment |
| **Паттерн FastAPI + WebSocket** | WhisperLiveKit | Архитектурный паттерн для Python-сервера |

### 5.2 Выкидываем (не нужно)

| Артефакт | Откуда | Причина |
|----------|--------|---------|
| `main.py` | Whisperer_GUI | PyQt5 GUI — заменяется Electron |
| `run.py` | Whisperer_v1 | Лаунчер — заменяется Electron main process |
| `api_server.py` | Whisperer_v1 | Flask без диаризации — переписываем на FastAPI |
| `archive/` весь | Whisperer_v1 | Устаревшие версии |
| `static/index.html` | Whisperer_v1 | HTML-заглушка |
| `Interface v2/` | Whisperer_v1 | Альтернативный фронтенд |
| `simul_whisper/` | WhisperLiveKit | Dual-license, стриминг не нужен |
| `whisper_streaming_custom/` | WhisperLiveKit | Стриминг не нужен |
| `diarization/diart_backend.py` | WhisperLiveKit | Альтернатива PyAnnote |
| `diarization/sortformer_backend.py` | WhisperLiveKit | Требует nemo_toolkit |
| `web/` | WhisperLiveKit | HTML/JS фронтенд |
| Все `Dockerfile` и `docker-compose.yml` | Все проекты | Десктопное приложение, не сервер |
| `__pycache__/`, `venv/`, `node_modules/` | Все проекты | Артефакты сборки |
| `config.py` (Python) | Whisperer_v1 | Заменяется electron-store |
| `i18n.py` (Python) | Whisperer_v1 | Заменяется TypeScript-решением |
| Лишние shadcn/ui врапперы (~35 из 48) | Whisperer_v1 | Используем реально нужные 12-15 компонентов |

---

## 6. Модели машинного обучения

### 6.1 Транскрибация (Speech-to-Text)

| Модель | Размер | WER (рус.) | Скорость | GPU RAM | Рекомендация |
|--------|--------|------------|----------|---------|--------------|
| `openai/whisper-large-v3` | 1.55B | 5-8% | ★★☆ | ~6 GB | Бенчмарк качества |
| `openai/whisper-large-v3-turbo` | 809M | 7-10% | ★★★★ | ~4 GB | Баланс |
| `Systran/faster-whisper-large-v3` | 1.55B | 5-8% | ★★★★★ | ~3 GB | **Рекомендуется** |
| `Systran/faster-whisper-medium` | 769M | 10-14% | ★★★★★ | ~2 GB | Легковесный вариант |
| `openai/whisper-medium` | 769M | 10-14% | ★★★☆ | ~4 GB | Компромисс |

**Рекомендация: `faster-whisper-large-v3` (CTranslate2 backend)**
- Качество как у large-v3, но через CTranslate2 — в 4 раза быстрее на GPU, быстрее и меньше памяти на CPU
- Интегрируется через библиотеку `faster-whisper` (Python package)
- Идеально для десктопа: меньше памяти, выше скорость при том же качестве

**Дообучение:** НЕ ТРЕБУЕТСЯ. Whisper-large-v3 уже отлично знает русский язык. WER 5-8% на чистой речи. Основные источники ошибок:
- Перекрёстная речь (overlapping speech) — доминирует над ошибками ASR
- Качество микрофонов (дальнее поле, эхо)
- Ошибки диаризации

LoRA-файнтюнинг (~10M параметров) на RTX 3090/4090 стоит рассмотреть только при работе с domain-specific терминологией (медицина, юриспруденция). Бесплатный датасет: **Golos** от Сбера (1200+ часов, 10K+ дикторов).

### 6.2 Диаризация (Speaker Diarization)

| Модель | Примечание |
|--------|------------|
| **`pyannote/speaker-diarization-3.1`** | Текущий стандарт. Лучше на overlapping speech. Требует HF-токен + принятие условий |
| `pyannote/speaker-diarization-3.0` | Предыдущая версия. Стабильна |

**Требования:** HuggingFace-токен в `.env`, пользователь должен принять условия использования моделей на hf.co.

### 6.3 VAD (Voice Activity Detection) — опционально

| Модель | Примечание |
|--------|------------|
| `silero-vad` | Лёгкая, через torch.hub. От WhisperLiveKit |

Используется для предварительной сегментации тишины/речи перед транскрибацией (улучшает качество диаризации на длинных записях).

---

## 7. Архитектура системы

### 7.1 Общая схема

```
┌──────────────────────────────────────────────────────────┐
│                    Electron Main Process                  │
│                                                          │
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │   FileWatcher        │  │   BatchScheduler          │  │
│  │   (chokidar)         │  │   (node-cron)             │  │
│  │                      │  │                           │  │
│  │  Следит за папкой    │  │  Периодический запуск     │  │
│  │  входных файлов      │  │  обработки папки          │  │
│  └─────────┬───────────┘  └───────────┬───────────────┘  │
│            │                          │                   │
│  ┌─────────┴──────────────────────────┴───────────────┐  │
│  │              Python Backend Manager                 │  │
│  │  - Запуск FastAPI как subprocess                    │  │
│  │  - Health check (GET /api/health)                   │  │
│  │  - Перезапуск при падении                           │  │
│  │  - Сбор логов                                      │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │                                 │
│  ┌──────────────────────┴─────────────────────────────┐  │
│  │              App Config (electron-store)            │  │
│  │  - Выбранная модель                                 │  │
│  │  - Устройство (GPU/CPU)                             │  │
│  │  - Путь к входной папке                             │  │
│  │  - Путь к выходной папке                            │  │
│  │  - Cron-расписание                                  │  │
│  │  - Язык интерфейса                                  │  │
│  └────────────────────────────────────────────────────┘  │
│                         │ IPC (ipcMain/ipcRenderer)       │
└─────────────────────────┼────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────┐
│           Electron Renderer Process                       │
│                                                          │
│  React 18 + TypeScript + Tailwind CSS + shadcn/ui        │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ Settings │  │  Upload  │  │  Results              │   │
│  │ Panel    │  │  Zone    │  │  Viewer               │   │
│  │          │  │          │  │                       │   │
│  │ Модель   │  │ Drag &   │  │ Транскрипт с          │   │
│  │ Устр-во  │  │ Drop     │  │ метками спикеров      │   │
│  │ Формат   │  │ файлов   │  │ Таймстемпы            │   │
│  └──────────┘  └──────────┘  └──────────────────────┘   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Batch Monitor                                      │  │
│  │  - Состояние папки                                  │  │
│  │  - Очередь файлов                                   │  │
│  │  - История (таблица обработанных)                   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Status Bar                                          │  │
│  │  - Статус Python backend                            │  │
│  │  - Статус file watcher                              │  │
│  │  - Версия / обновления                              │  │
│  └────────────────────────────────────────────────────┘  │
│                         │ HTTP (localhost:PORT)            │
│                         │ WebSocket (ws://localhost:PORT)  │
└─────────────────────────┼────────────────────────────────┘
                          │
┌─────────────────────────┼────────────────────────────────┐
│            Python Backend (FastAPI subprocess)            │
│                                                          │
│  POST   /api/transcribe         Разовая транскрибация    │
│  POST   /api/queue              Добавить файл в очередь  │
│  GET    /api/queue/status       Статус очереди           │
│  DELETE /api/queue/:id          Удалить из очереди       │
│  WS     /ws/progress            Прогресс (per-file)      │
│  GET    /api/models             Доступные модели         │
│  GET    /api/health             Статус сервера + GPU     │
│  GET    /api/history            История обработок        │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Transcription Pipeline (на базе worker.py)       │   │
│  │                                                    │   │
│  │  Вход: audio.mp4 / video.mp4 / audio.wav / ...     │   │
│  │    │                                               │   │
│  │    ▼                                               │   │
│  │  [1] ffmpeg: конвертация в MP3                     │   │
│  │    │  (любой формат → MP3 128kbps стерео)          │   │
│  │    ▼                                               │   │
│  │  [2] ffmpeg: извлечение WAV                        │   │
│  │    │  (MP3 → WAV 16kHz mono PCM s16le)             │   │
│  │    ▼                                               │   │
│  │  [3] Диаризация (PyAnnote)                         │   │
│  │    │  Полный аудиофайл → speaker segments           │   │
│  │    ▼                                               │   │
│  │  [4] Транскрибация (faster-whisper / whisper)      │   │
│  │    │  Чанки по 300 сек → текст + сегменты          │   │
│  │    ▼                                               │   │
│  │  [5] Alignment                                      │   │
│  │    │  Сопоставление сегментов со спикерами          │   │
│  │    │  (средняя точка таймстемпа → speaker)          │   │
│  │    ▼                                               │   │
│  │  [6] Вывод                                         │   │
│  │    Выход: {name}.json, {name}.txt,                 │   │
│  │           {name}.srt, {name}.docx                   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Batch Queue (asyncio.Queue)                       │   │
│  │  - FIFO очередь файлов                             │   │
│  │  - Прогресс per-file через WebSocket               │   │
│  │  - Обработка ошибок                                │   │
│  │  - Отмена задачи                                   │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 7.2 Процессы и IPC

```
┌─────────────────┐     IPC (contextBridge)     ┌─────────────────┐
│  Main Process   │ ◄──────────────────────────►│ Renderer Process │
│                 │                              │                 │
│  - Node.js      │   invoke('transcribe', ...)  │  - Chromium     │
│  - Python mgr   │   send('progress', ...)      │  - React        │
│  - File system  │   handle('open-file-dialog') │                 │
│  - Config store │                              │                 │
└────────┬────────┘                              └────────┬────────┘
         │                                                │
         │ child_process.spawn                             │ HTTP + WS
         │                                                │
┌────────▼────────┐                              ┌────────▼────────┐
│  Python Backend │                              │  Python Backend │
│  (child process)│                              │  (same process) │
│                 │                              │                 │
│  FastAPI        │                              │  :PORT          │
│  uvicorn        │                              │                 │
└─────────────────┘                              └─────────────────┘
```

- **Main ↔ Renderer**: Electron IPC через `contextBridge` (preload.ts). Безопасный белый список методов
- **Renderer ↔ Python**: HTTP REST для команд, WebSocket для стриминга прогресса
- **Main → Python**: `child_process.spawn` с захватом stdout/stderr для логов

---

## 8. Стек технологий

### 8.1 Frontend (Electron Renderer)

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Electron | 33+ | Десктопная обёртка |
| React | 18 | UI-библиотека |
| TypeScript | 5.5+ | Типизация |
| Vite | 6+ | Сборка (electron-vite или vite-plugin-electron) |
| Tailwind CSS | 4+ | Стилизация |
| shadcn/ui | latest | Компоненты (над Radix UI) |
| Radix UI | latest | Headless UI-примитивы |
| Lucide React | latest | Иконки |
| react-i18next | latest | Интернационализация |
| zustand | latest | Управление состоянием (лёгкая альтернатива Redux) |
| react-hook-form | latest | Формы (настройки) |
| @tanstack/react-query | latest | Кэширование и fetching |
| electron-store | latest | Персистентная конфигурация |

### 8.2 Backend (Electron Main + Python)

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| TypeScript | 5.5+ | Electron main process |
| chokidar | latest | File watcher для папки |
| node-cron | latest | Периодический запуск обработки |
| electron-store | latest | Конфигурация приложения |
| Python | 3.11+ | ML-бэкенд |
| FastAPI | latest | REST API + WebSocket |
| uvicorn | latest | ASGI-сервер |
| faster-whisper | latest | Транскрибация (CTranslate2) |
| pyannote.audio | 3.1+ | Диаризация спикеров |
| torch + torchaudio | 2.1+ | PyTorch runtime |
| huggingface-hub | 0.23+ | Загрузка моделей |
| pydantic | latest | Валидация данных |
| python-dotenv | latest | .env-переменные |

### 8.3 Системные зависимости

| Зависимость | Назначение |
|-------------|-----------|
| FFmpeg | Конвертация аудио/видео форматов |
| CUDA (опционально) | GPU-ускорение |

---

## 9. Структура проекта

```
WhisperAnnote/
├── package.json                    ← Корневой package.json (Electron)
├── tsconfig.json                   ← TypeScript конфигурация
├── electron-builder.yml            ← Конфигурация сборки для Windows
├── .env.example                    ← HF_TOKEN=your_token_here
├── .gitignore
├── AGENTS.md                       ← Инструкции для AI-агентов
├── kilo.json                       ← Конфигурация Kilo
│
├── electron/                       ← Electron Main Process
│   ├── main.ts                     ← Точка входа Electron
│   ├── preload.ts                  ← Context bridge (IPC безопасность)
│   ├── python-manager.ts           ← Управление Python subprocess
│   ├── file-watcher.ts             ← chokidar watcher для папки
│   ├── scheduler.ts                ← node-cron расписание
│   ├── ipc-handlers.ts             ← Обработчики IPC-вызовов
│   ├── config-store.ts             ← electron-store обёртка
│   ├── window-manager.ts           ← Создание/управление окном
│   └── updater.ts                  ← Автообновление (electron-updater)
│
├── src/                            ← React Renderer
│   ├── App.tsx                     ← Корневой компонент
│   ├── main.tsx                    ← Точка входа React
│   ├── index.css                   ← Tailwind + кастомные стили
│   ├── i18n/                       ← Интернационализация
│   │   ├── index.ts                ← Конфигурация react-i18next
│   │   ├── locales/
│   │   │   ├── ru/translation.json ← Русский перевод (основной)
│   │   │   └── en/translation.json ← Английский (fallback)
│   │   └── types.ts                ← Типы для переводов
│   ├── stores/                     ← Zustand stores
│   │   ├── useSettingsStore.ts     ← Настройки
│   │   ├── useTranscriptionStore.ts← Состояние транскрибации
│   │   ├── useBatchStore.ts        ← Очередь пакетной обработки
│   │   └── useBackendStore.ts      ← Статус Python backend
│   ├── hooks/                      ← Кастомные React-хуки
│   │   ├── useWebSocket.ts         ← WebSocket-подключение
│   │   ├── useApi.ts               ← HTTP-запросы к Python API
│   │   └── useElectron.ts          ← Доступ к IPC
│   ├── lib/                        ← Утилиты
│   │   ├── api.ts                  ← API-клиент
│   │   ├── formatters.ts           ← Форматирование таймстемпов
│   │   └── clipboard.ts            ← Копирование в буфер
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx        ← Основной layout
│   │   │   ├── Sidebar.tsx         ← Боковая панель навигации
│   │   │   ├── Header.tsx          ← Верхняя панель
│   │   │   └── StatusBar.tsx       ← Нижняя статус-строка
│   │   ├── upload/
│   │   │   ├── DropZone.tsx        ← Drag-and-drop зона
│   │   │   ├── FileList.tsx        ← Список выбранных файлов
│   │   │   └── QuickSettings.tsx   ← Быстрые настройки перед запуском
│   │   ├── transcription/
│   │   │   ├── ProgressCard.tsx    ← Карточка прогресса
│   │   │   ├── SegmentList.tsx     ← Список сегментов с speaker-метками
│   │   │   ├── SpeakerLegend.tsx   ← Легенда спикеров
│   │   │   └── ExportPanel.tsx     ← Экспорт результатов
│   │   ├── batch/
│   │   │   ├── FolderConfig.tsx    ← Настройка папки + cron
│   │   │   ├── QueueList.tsx       ← Очередь файлов
│   │   │   └── HistoryTable.tsx    ← История обработок
│   │   ├── settings/
│   │   │   ├── ModelSettings.tsx   ← Выбор модели + устройство
│   │   │   ├── OutputSettings.tsx  ← Настройки вывода
│   │   │   └── GeneralSettings.tsx ← Язык, тема, порт
│   │   └── ui/                     ← shadcn/ui компоненты
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── input.tsx
│   │       ├── select.tsx
│   │       ├── switch.tsx
│   │       ├── tabs.tsx
│   │       ├── tooltip.tsx
│   │       ├── badge.tsx
│   │       ├── dialog.tsx
│   │       ├── progress.tsx
│   │       ├── scroll-area.tsx
│   │       ├── separator.tsx
│   │       ├── table.tsx
│   │       ├── toast.tsx
│   │       └── slider.tsx
│   └── types/
│       ├── transcription.ts        ← Типы транскрипции
│       ├── settings.ts             ← Типы настроек
│       └── batch.ts                ← Типы пакетной обработки
│
├── backend/                        ← Python Backend
│   ├── server.py                   ← FastAPI сервер (точка входа)
│   ├── pipeline.py                 ← Пайплайн (адаптированный worker.py)
│   ├── queue_manager.py            ← Batch очередь
│   ├── models.py                   ← Pydantic модели
│   ├── websocket_manager.py        ← WebSocket-комнаты по task_id
│   ├── utils.py                    ← Утилиты (ffmpeg, валидация)
│   ├── config.py                   ← Конфигурация бэкенда
│   └── requirements.txt            ← Python зависимости
│
├── resources/                      ← Ресурсы Electron
│   ├── icon.ico                    ← Иконка приложения
│   ├── icon.png
│   └── tray-icon.png
│
├── scripts/                        ← Скрипты сборки
│   ├── dev.ps1                     ← Dev-режим
│   └── build.ps1                   ← Сборка инсталлятора
│
└── tests/
    ├── frontend/                   ← Vitest unit-тесты
    └── backend/                    ← Pytest тесты
```

---

## 10. Компоненты детально

### 10.1 Electron Main Process

#### `main.ts` — точка входа
```
- Создаёт BrowserWindow (frameless, с кастомным title bar)
- Инициализирует PythonBackendManager, FileWatcher, Scheduler
- Регистрирует IPC-обработчики
- Управляет жизненным циклом приложения
```

#### `python-manager.ts` — управление Python-процессом
```
- Находит Python (python3/python) в PATH или bundled
- spawn: python -m uvicorn backend.server:app --host 127.0.0.1 --port {PORT}
- Health check: периодический GET /api/health
- Перезапуск при падении (до 3 попыток)
- Захват stdout/stderr → лог-файл + отправка в renderer
- Graceful shutdown (SIGTERM → SIGKILL через 5 сек)
```

#### `file-watcher.ts` — отслеживание папки
```
- chokidar.watch(watchFolder, { ignored: /\.tmp$/ })
- Событие 'add' → fileQueue.add(filePath)
- Событие 'change' → игнорируем
- При добавлении нового файла: отправка IPC-события в renderer
- Дедупликация: проверка размера файла (файл может дописываться)
- Стабилизация: ждать 2 сек после последнего изменения перед добавлением в очередь
```

#### `scheduler.ts` — cron-расписание
```
- node-cron с настраиваемым выражением (по умолчанию: "0 */1 * * *" — каждый час)
- В заданное время: сканирует watchFolder, добавляет новые файлы в очередь
- Опционально: проверка хеша файла, чтобы не обрабатывать одно и то же дважды
```

### 10.2 React Renderer — страницы/вкладки

Основной layout: **Sidebar** (слева, 3 вкладки) + **Content** (справа).

**Вкладка 1: Транскрибация**
- DropZone для ручной загрузки файлов
- QuickSettings: модель, устройство (перед запуском)
- Кнопка «Расшифровать»
- ProgressCard для каждого активного файла
- SegmentList с результатом и SpeakerLegend

**Вкладка 2: Мониторинг папки**
- FolderConfig: путь к папке, кнопка «Выбрать»
- CronConfig: выражение cron, переключатель вкл/выкл
- QueueList: список файлов в очереди (с возможностью удаления)
- HistoryTable: таблица обработанных файлов (имя, дата, длительность, статус, открыть результат)

**Вкладка 3: Настройки**
- ModelSettings: выбор модели (выпадающий список), устройство GPU/CPU
- OutputSettings: форматы вывода (JSON/TXT/SRT/DOCX), путь к выходной папке
- GeneralSettings: язык интерфейса, тема, порт бэкенда

**StatusBar (всегда внизу):**
- Индикатор Python backend (зелёный/красный)
- Индикатор file watcher
- Версия приложения

### 10.3 Python Backend — эндпоинты

#### `POST /api/transcribe`
```
Request (multipart/form-data):
  file: binary (аудио/видео файл)
  model: string (default: "faster-whisper-large-v3")
  device: "cuda" | "cpu" (default: "cuda")
  language: string (default: "ru")
  output_formats: string[] (default: ["json", "txt", "srt"])

Response 202:
  { task_id: uuid, status: "queued" }

WebSocket /ws/progress/{task_id} стримит прогресс.
```

#### `POST /api/queue`
```
Request (JSON):
  file_path: string (абсолютный путь к файлу)
  model: string
  device: "cuda" | "cpu"
  output_formats: string[]

Response 202:
  { task_id: uuid, status: "queued" }
```

#### `GET /api/queue/status`
```
Response:
  { queued: int, processing: int, tasks: TaskInfo[] }
```

#### `DELETE /api/queue/{task_id}`
```
Response: { success: true }
```

#### `GET /api/models`
```
Response:
  { available: ["faster-whisper-large-v3", "faster-whisper-medium",
                 "whisper-large-v3", "whisper-large-v3-turbo",
                 "whisper-medium"],
    downloaded: ["faster-whisper-large-v3"] }
```

#### `GET /api/health`
```
Response:
  { status: "ok", python_version: "3.12",
    cuda_available: true, cuda_devices: 1,
    whisper_ready: true, pyannote_ready: true,
    models_cached: ["faster-whisper-large-v3", "pyannote/speaker-diarization-3.1"] }
```

#### `WS /ws/progress/{task_id}`
```
Сообщения сервера:
  { type: "stage", stage: "converting_to_mp3" | "extracting_wav" |
         "diarization" | "transcription" | "formatting" }
  { type: "progress", percent: 45, message: "Обработка чанка 3/12..." }
  { type: "log", message: "Загрузка модели faster-whisper-large-v3 на CUDA..." }
  { type: "complete", output_files: [...], duration_sec: 142.5 }
  { type: "error", message: "FFmpeg не найден" }
```

---

## 11. Пайплайн обработки аудио

Адаптирован из `Whisperer_GUI/worker.py`.

```
Входной файл
    │
    ▼
┌─────────────────────────────────────────────┐
│ Шаг 1: Конвертация в MP3                    │
│ ffmpeg -i input.ext -b:a 128k output.mp3   │
│ (если вход уже MP3 — пропускаем)            │
├─────────────────────────────────────────────┤
│ Шаг 2: Извлечение WAV                       │
│ ffmpeg -i file.mp3 -ar 16000 -ac 1          │
│        -c:a pcm_s16le file.wav              │
├─────────────────────────────────────────────┤
│ Шаг 3: Диаризация                           │
│ Pipeline.from_pretrained(                   │
│   "pyannote/speaker-diarization-3.1")       │
│ dia = pipeline({"audio": wav_path})          │
│ spk_segments = [{start, end, speaker}]      │
├─────────────────────────────────────────────┤
│ Шаг 4: Чанкованная транскрибация            │
│ CHUNK_SECONDS = 300                         │
│ Для каждого чанка:                          │
│   ffmpeg извлекает под-WAV                  │
│   whisper_model.transcribe(chunk_wav,       │
│     language="ru")                          │
│   Сегменты: {start, end, text}              │
│   Коррекция таймстемпов (offset чанка)      │
├─────────────────────────────────────────────┤
│ Шаг 5: Сопоставление спикеров               │
│ def speaker_at(t):                          │
│   for seg in spk_segments:                  │
│     if seg.start <= t <= seg.end:           │
│       return seg.speaker                    │
│ Для каждого транскрибированного сегмента:   │
│   midpoint = (seg.start + seg.end) / 2       │
│   speaker = speaker_at(midpoint)            │
├─────────────────────────────────────────────┤
│ Шаг 6: Форматирование вывода                │
│ JSON: [{speaker, start, end, text}]         │
│ TXT:  [HH:MM:SS] SPEAKER: text              │
│ SRT:  стандартный SubRip                    │
│ DOCX: Word-документ с форматированием       │
└─────────────────────────────────────────────┘
```

**Важные константы:**
- `CHUNK_SECONDS = 300` (5 минут на чанк)
- Частота дискретизации: 16000 Hz
- Каналы: 1 (моно)
- Формат: PCM s16le
- Язык: `ru` (русский)

**Оптимизации:**
- Модель загружается ОДИН раз при старте сервера и живёт в памяти
- При смене модели в настройках — перезагрузка
- Кэширование результатов FFmpeg (wav хранится до завершения обработки)

---

## 12. API-контракты

### 12.1 Типы данных (TypeScript, зеркалируют Pydantic)

```typescript
// Сегмент транскрипции с меткой спикера
interface TranscriptSegment {
  speaker: string;       // "SPEAKER_00"
  start: number;          // секунды от начала
  end: number;            // секунды от начала
  text: string;           // текст сегмента
  confidence?: number;    // уверенность (0-1)
}

// Ответ после завершения транскрибации
interface TranscriptionResult {
  task_id: string;
  file_name: string;
  language: string;
  duration_sec: number;
  segments: TranscriptSegment[];
  full_text: string;
  output_files: {
    json?: string;
    txt?: string;
    srt?: string;
    docx?: string;
  };
}

// Задача в очереди
interface TaskInfo {
  task_id: string;
  file_path: string;
  file_name: string;
  status: "queued" | "converting" | "diarizing" | "transcribing" | "formatting" | "completed" | "error";
  progress_percent: number;
  queue_position: number;
  created_at: string;      // ISO 8601
  error_message?: string;
  result?: TranscriptionResult;
}

// Сообщение WebSocket
type WSMessage =
  | { type: "stage"; stage: string }
  | { type: "progress"; percent: number; message: string }
  | { type: "log"; message: string }
  | { type: "complete"; output_files: Record<string, string>; duration_sec: number }
  | { type: "error"; message: string };

// Health-check
interface HealthStatus {
  status: "ok" | "error";
  python_version: string;
  cuda_available: boolean;
  cuda_devices: number;
  whisper_ready: boolean;
  pyannote_ready: boolean;
  models_cached: string[];
}

// Модели
interface AvailableModels {
  available: string[];
  downloaded: string[];
  current: string;
}
```

### 12.2 IPC-контракты (Main ↔ Renderer)

```typescript
// Renderer → Main (invoke/handle)
'select-file'           → { filePaths: string[], canceled: boolean }
'select-folder'         → { folderPath: string | null, canceled: boolean }
'get-app-config'         → AppConfig
'set-app-config'         → void (key, value)
'start-python-backend'   → { port: number, status: string }
'stop-python-backend'    → void
'get-python-status'      → { running: boolean, port: number }
'open-external-url'      → void (url: string)
'get-file-info'          → { name, size, mtime } (filePath: string)

// Main → Renderer (send/on)
'python-backend-ready'   → { port: number }
'python-backend-error'   → { error: string }
'python-backend-log'     → { line: string }
'file-watcher-new-file'  → { filePath: string, fileName: string }
'batch-processing-start' → { taskId: string, fileName: string }
```

---

## 13. Состояния и потоки данных

### 13.1 Zustand Stores

```typescript
// useSettingsStore — настройки пользователя
{
  model: "faster-whisper-large-v3",
  device: "cuda" | "cpu",
  outputFormats: ["json", "txt", "srt"],
  language: "ru",
  theme: "system" | "light" | "dark",
  backendPort: 8777,

  watchFolder: string | null,       // путь к отслеживаемой папке
  outputFolder: string | null,      // путь к папке с результатами
  cronExpression: string,           // "0 */1 * * *"
  batchEnabled: boolean,            // автообработка вкл/выкл
  stabilizeMs: 2000,                // задержка перед началом обработки нового файла
}

// useTranscriptionStore — активные транскрипции
{
  tasks: Map<taskId, TaskInfo>,
  activeTaskId: string | null,       // выбранная задача для просмотра
}

// useBatchStore — пакетная очередь
{
  queue: TaskInfo[],
  history: TaskInfo[],               // завершённые задачи
  isWatcherRunning: boolean,
  lastScanTime: string | null,
}

// useBackendStore — состояние Python backend
{
  isRunning: boolean,
  port: number,
  isHealthy: boolean,
  cudaAvailable: boolean,
  modelsCached: string[],
  startTime: string | null,
}
```

### 13.2 Жизненный цикл обработки одного файла

```
Файл добавлен (ручной upload ИЛИ file watcher)
    │
    ▼
Создаётся task_id (UUID)
Статус: queued
    │
    ▼
Попадает в asyncio.Queue (Python)
Начинается обработка:
    │
    ├──► converting_to_mp3   (progress 0-10%)
    ├──► extracting_wav      (progress 10-15%)
    ├──► diarization          (progress 15-35%)
    ├──► transcription        (progress 35-95%)  ← чанки, прогресс линейно
    └──► formatting           (progress 95-100%)
    │
    ▼
Статус: completed
Результат доступен
    │
    ▼
Добавляется в history
Файлы вывода лежат в outputFolder
```

---

## 14. Конфигурация и настройки

### 14.1 Хранение конфигурации

Используется `electron-store` в Main Process, доступ к Renderer через IPC.

```json
{
  "model": "faster-whisper-large-v3",
  "device": "cuda",
  "outputFormats": ["json", "txt", "srt"],
  "language": "ru",
  "theme": "dark",
  "backendPort": 8777,
  "watchFolder": null,
  "outputFolder": null,
  "cronExpression": "0 */1 * * *",
  "batchEnabled": false,
  "stabilizeMs": 2000,
  "windowBounds": { "x": 100, "y": 100, "width": 1280, "height": 860 },
  "maxHistoryItems": 200,
  "firstRun": true
}
```

### 14.2 .env (бэкенд)

```
HUGGINGFACE_HUB_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx
BACKEND_PORT=8777
BACKEND_HOST=127.0.0.1
MODEL_CACHE_DIR=./backend/models
```

`.env.example` включён в репозиторий. Пользователь копирует → `.env` и вставляет свой HF-токен.

---

## 15. Автообработка папки

### 15.1 Алгоритм

```
Пользователь указывает watchFolder в настройках
Пользователь включает batchEnabled = true
    │
    ▼
FileWatcher (chokidar) запускается в Main Process
    │
    ├──► Событие 'add' обнаружено:
    │    1. Проверить расширение (mp4, mp3, wav, mov, avi, webm, mkv, ogg, flac, m4a)
    │    2. Игнорировать временные файлы (*.tmp, *.part, *.crdownload)
    │    3. Запомнить { path, size, timestamp }
    │
    ├──► Ждать stabilizeMs (2 сек по умолчанию):
    │    1. Если за это время файл изменился — сбросить таймер
    │    2. Если файл стабилен — добавить в очередь
    │
    └──► Отправить в Python API:
         POST /api/queue
         { file_path: "C:\WatchFolder\meeting.mp4",
           model: "faster-whisper-large-v3",
           device: "cuda",
           output_formats: ["json", "txt", "srt"] }
```

### 15.2 Cron-режим

```
batchEnabled = true
cronExpression = "0 */1 * * *"   ← каждый час
    │
    ▼
Scheduler (node-cron) тикает по расписанию:
    1. Сканировать watchFolder (fs.readdir)
    2. Найти файлы, которых нет в истории (по пути + размеру + mtime)
    3. Для каждого нового файла → POST /api/queue
```

### 15.3 Дедупликация

В истории сохраняется `{ filePath, fileSize, fileMtime, processedAt }`. При сканировании файлы с совпадающими `path+size+mtime` пропускаются.

---

## 16. План реализации (этапы)

### Этап 1: Инициализация проекта (день 1)

- Создать структуру директорий
- Настроить `package.json` для Electron + React + Vite
- Настроить TypeScript, Tailwind, shadcn/ui
- Настроить `backend/requirements.txt`
- Создать `.env.example`, `.gitignore`, `AGENTS.md`
- Настроить electron-vite

### Этап 2: Python Backend Core (дни 2-3)

- Перенести логику из `worker.py` в `backend/pipeline.py`
- Обернуть в FastAPI: эндпоинты `/api/health`, `/api/models`
- Реализовать `/api/transcribe` (одиночный файл, multipart)
- Реализовать WebSocket `/ws/progress/{task_id}`
- Реализовать `queue_manager.py` (asyncio.Queue)
- Тестирование на реальных файлах (русская речь)

### Этап 3: Electron Shell (дни 3-4)

- `main.ts`: BrowserWindow + Python Manager
- `python-manager.ts`: spawn, health check, restart
- `preload.ts`: contextBridge
- `ipc-handlers.ts`: select-file, select-folder, get/set-config
- `config-store.ts`: electron-store

### Этап 4: React UI — Транскрибация (дни 4-6)

- AppShell, Sidebar, Header, StatusBar
- DropZone + FileList
- QuickSettings (модель, устройство)
- ProgressCard + SegmentList + SpeakerLegend
- ExportPanel
- Интеграция с Python API через WebSocket

### Этап 5: Автообработка папки (дни 6-7)

- `file-watcher.ts`: chokidar
- `scheduler.ts`: node-cron
- FolderConfig UI (выбор папки, cron, вкл/выкл)
- QueueList + HistoryTable
- Дедупликация

### Этап 6: Настройки и i18n (дни 7-8)

- ModelSettings, OutputSettings, GeneralSettings
- react-i18next + переводы (ru + en)
- Тёмная/светлая тема

### Этап 7: Экспорт и финальная полировка (дни 8-9)

- Экспорт в DOCX (python-docx)
- Копирование в буфер обмена
- Обработка ошибок (FFmpeg не найден, HF токен не задан и т.д.)
- Сборка инсталлятора (electron-builder)
- Тестирование на Windows

---

## 17. История обсуждения (полный чат)

### Сообщение пользователя 1

> H:\GitHub\Whisperer_v1 / H:\GitHub\Whisperer_GUI / H:\GitHub\WhisperLiveKit
>
> Давным давно я написал Whisperer для транскрибации совещаний. Можешь пожалуйста взглянуть пока что приблизительно на репозитории и подсказать как мы можем это все объединить и построить новую рабочую версию?
>
> У меня немного сместился фокус - это должен быть ориентированный на русский язык транскрибатор с диаризацией с современным electron интерфейсом, возможностью выбора модели, GPU\CPU и возможностью автоматического вызова выполнения из папки (грубо говоря у меня есть папка с записями, я хочу чтобы из нее при каком-то эвенте - крон или по факту появления файла запускалась сначала конвертация в mp3 а после транскрибация и диаризация)

### Ответ ассистента (аудит трёх репозиториев)

Проанализированы три репозитория:

**Whisperer_v1** — Flask + React (shadcn/Tailwind). Full-stack веб-приложение. Транскрибация Whisper, i18n (5 языков вкл. русский), выбор модели/GPU. Диаризация была в оригинальной версии, но вырезана в активной. Есть archive с полным кодом.

**Whisperer_GUI** — PyQt5 десктоп (~370 строк Python). Полный пайплайн: FFmpeg → PyAnnote диаризация → Whisper транскрибация чанками по 5 мин → сопоставление спикеров → JSON/TXT/SRT/MD. Русский язык. Выбор модели large-v3/large-v3-turbo, GPU/CPU.

**WhisperLiveKit** — FastAPI + WebSocket стриминг. Архитектурные паттерны интересны, но SimulStreaming под dual-license (ограничения коммерческого использования) и для нашей задачи стриминг не нужен.

Предложена гибридная архитектура: Electron (main: chokidar + node-cron + Python subprocess manager) + React renderer (shadcn/ui) + Python FastAPI backend (на базе worker.py).

### Сообщение пользователя 2

> Что мы можем выкинуть? Что лишнее? И какие модели лучше распознают русский язык?

### Ответ асситента (анализ на выброс + модели)

**Выкидываем:**
- Whisperer_v1: archive/, Interface v2/, run.py, static/index.html, Dockerfile/docker-compose, venv, ~35 из 48 shadcn врапперов
- Whisperer_GUI: main.py (PyQt5 GUI), __pycache__
- WhisperLiveKit: simul_whisper/ (dual-license), whisper_streaming_custom/, web/ (HTML фронтенд), diarization/diart_backend.py и sortformer_backend.py, Dockerfile

**Ценное ядро — 3 файла логики:**
- `Whisperer_GUI/worker.py` — полный пайплайн транскрибация + диаризация
- `Whisperer_v1/Transcription Studio Interface/src/` — React компоненты
- `Whisperer_v1/locales/ru/messages.json` — русская локализация

**Модели для русского:**
- Рекомендация: `faster-whisper-large-v3` (CTranslate2 backend) — качество large-v3, скорость в 4x выше
- Диаризация: `pyannote/speaker-diarization-3.1`

### Сообщение пользователя 3

> А дообучить модель сильно дорого будет?

### Ответ асситента (анализ дообучения)

Дообучать — дорого и не нужно.

Full fine-tune large-v3 (1.55B): 4-8× A100 80GB, 3-7 дней, $2000-5000+
LoRA fine-tune (~10M параметров): 1× RTX 3090/4090, 8-24 часа, ~$50-100 в облаке

Whisper-large-v3 уже отлично знает русский — WER 5-8% без дообучения. Прирост от файнтюна ~2-3% WER — пользователь разницы не заметит. Основные источники ошибок: overlapping speech, качество микрофонов, ошибки диаризации.

Если всё же нужно (domain-specific терминология): Golos датасет от Сбера (1200+ часов), LoRA за ночь на своей RTX.

### Сообщение пользователя 4

> Неа, тренировать тогда не надо. Подготовь полный спец .md файл я передам агенту архитектору на рассмотрение + включи туда весь наш чат

### Ответ асситента (данный документ)

Создан `ARCHITECTURE_SPEC.md` с полной спецификацией проекта WhisperAnnote.

---

## Приложения

### A. Полезные ссылки

- [faster-whisper (CTranslate2)](https://github.com/SYSTRAN/faster-whisper)
- [pyannote-audio](https://github.com/pyannote/pyannote-audio)
- [shadcn/ui](https://ui.shadcn.com/)
- [electron-vite](https://electron-vite.org/)
- [electron-store](https://github.com/sindresorhus/electron-store)
- [chokidar](https://github.com/paulmillr/chokidar)

### B. Лицензионные ограничения

- `faster-whisper`: MIT
- `pyannote.audio`: MIT (модели требуют принятия условий на hf.co)
- `silero-vad`: MIT
- SimulStreaming (WhisperLiveKit): PolyForm Noncommercial 1.0.0 — **НЕ ИСПОЛЬЗУЕМ**
