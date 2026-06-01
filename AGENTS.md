# AGENTS.md — инструкции для AI-агентов

## Проект

WhisperAnnote v2 — десктопное приложение для транскрибации и диаризации русской речи (Electron + React + Python FastAPI).

## Команды

```bash
# Разработка
npm run dev          # Запуск Electron + React (dev mode)
npm run build        # Сборка продакшен-бандла
npm run typecheck    # Проверка типов TypeScript

# Python backend
pip install -r backend/requirements.txt
python backend/server.py

# Сборка инсталлятора
npm run package
```

## Документация проекта

- `TECHNICAL_SPECIFICATION.md` — техническое задание
- `ARCHITECTURE_SPEC.md` — полная спецификация архитектуры
- `INHERITED_ARCHITECTURE.md` — заимствования из старых проектов
