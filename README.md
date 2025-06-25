<<<<<<< HEAD
# whisper-pyannote-gui
=======
# Whisper-PyAnnote GUI
Простое GUI-приложение на PyQt5 для транскрибации аудио/видео с помощью **OpenAI Whisper** и диаризации речевых сегментов через **pyannote.audio**.  
На выходе создаются четыре файла на основе исходного имени ролика:

* `<name>.json` — сегменты с метаданными  
* `<name>.txt` — плоская стенограмма  
* `<name>.srt` — субтитры (SubRip)  
* `<name>.md` — та же стенограмма в Markdown

## Возможности
* Поддержка моделей Whisper `large-v3` и `large-v3-turbo`
* Автоматическое разделение длинных файлов на чанки (по 5 минут)
* Диаризация через «pyannote/speaker-diarization-3.1»
* Выбор устройства CUDA/CPU
* Простое drag-and-drop: укажите медиафайл и папку сохранения
* Прогресс-бар и логирование в реальном времени

## Установка
```bash
git clone https://github.com/<user>/<repo>.git
cd <repo>
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Дополнительно установите FFmpeg и убедитесь, что исполняемый файл ffmpeg доступен в PATH.

## Переменные окружения
Для импорта токена создайте файл .env или экспортируйте в терминале:

```bash
export HUGGINGFACE_HUB_TOKEN="<ваш-hf-token>"
```

Также для работы необходим токен для pyannote. Авторизуйтесь в Hugginface
https://huggingface.co/pyannote/speaker-diarization-3.1
https://huggingface.co/pyannote/segmentation-3.0

## Запуск
```bash
python main.py
```

## Известные ограничения
pyannote.audio требует GPU с >=11 GB VRAM для realtime-скорости; на CPU будет заметно медленнее.
Для длинных дорожек Whisper large-v3-turbo рекомендует >=16 GB VRAM.
В коде задан фиксированный размер чанка CHUNK_SECONDS = 300; при желании измените в worker.py.

## Лицензия
Проект распространяется по лицензии MIT 
>>>>>>> 9484a34 (Initial commit: GUI, worker, docs, gitignore)
