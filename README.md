# WhisperAnnote v2

Десктопное приложение для транскрибации и диаризации русскоязычных аудиозаписей совещаний.

**Статус:** Проектирование

## Версии

| Версия | Тег | Описание |
|--------|-----|----------|
| **v2** (текущая) | `main` | Electron + React + FastAPI — в разработке |
| **v1** (архив) | [`v1-archived`](../../releases/tag/v1-archived) | PyQt5 desktop app (Whisper + PyAnnote) |

## Документация

| Документ | Описание |
|----------|---------|
| [`TECHNICAL_SPECIFICATION.md`](./TECHNICAL_SPECIFICATION.md) | Техническое задание |
| [`ARCHITECTURE_SPEC.md`](./ARCHITECTURE_SPEC.md) | Полная спецификация архитектуры |
| [`INHERITED_ARCHITECTURE.md`](./INHERITED_ARCHITECTURE.md) | Заимствования из исходных проектов |

## Стек (v2)

```
Electron (main: TypeScript + chokidar + node-cron)
  ├── React (renderer: TypeScript + Tailwind + shadcn/ui)
  └── Python (subprocess: FastAPI + faster-whisper + pyannote.audio)
```

## Запуск старой версии (v1)

```bash
git checkout v1-archived
pip install -r requirements.txt
python main.py
```
