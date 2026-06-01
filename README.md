# WhisperAnnote v2

Десктопное приложение для транскрибации и диаризации русскоязычных аудиозаписей совещаний.

**Статус:** Проектирование • **Требуется:** Windows 10/11 + NVIDIA GPU (CUDA)

## Версии

| Версия | Тег | Описание |
|--------|-----|----------|
| **v2** (текущая) | `main` | Electron + React + FastAPI — в разработке |
| **v1** (архив) | [`v1-archived`](../../releases/tag/v1-archived) | PyQt5 desktop app (Whisper + PyAnnote) |

## Документация

| Документ | Описание |
|----------|---------|
| [`TECHNICAL_SPECIFICATION.md`](./TECHNICAL_SPECIFICATION.md) | Техническое задание (ревизия 2.1) |
| [`ARCHITECTURE_SPEC.md`](./ARCHITECTURE_SPEC.md) | Полная спецификация архитектуры |
| [`INHERITED_ARCHITECTURE.md`](./INHERITED_ARCHITECTURE.md) | Заимствования из исходных проектов |
| [`AGENTS.md`](./AGENTS.md) | Протокол GRACE + инструкции для AI-агентов |
| [`docs/`](./docs) | GRACE-артефакты (XML): requirements, technology, development-plan, verification-plan, knowledge-graph, operational-packets |

## Методология

Проект ведётся по **GRACE** (Graph-RAG Anchored Code Engineering) — контракт-ориентированный
процесс разработки с AI-агентами: общие XML-артефакты в `docs/`, семантическая разметка в коде,
knowledge graph для навигации. См. [`AGENTS.md`](./AGENTS.md).

## Стек (v2)

```
Electron (main: TypeScript + chokidar + node-cron)
  ├── React (renderer: TypeScript + Tailwind + shadcn/ui + react-i18next)
  └── Python (subprocess: FastAPI + faster-whisper + pyannote.audio)
```

- **Транскрибация:** faster-whisper (CTranslate2), нативная обработка длинных файлов + `vad_filter` (без ручного чанкинга)
- **Диаризация:** pyannote.audio 3.1, сопоставление спикеров методом max-overlap
- **Исполнение:** только GPU (CUDA) в v2; CPU не поддерживается

## Запуск старой версии (v1)

```bash
git checkout v1-archived
pip install -r requirements.txt
python main.py
```
