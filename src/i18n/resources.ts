// FILE: src/i18n/resources.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Define ru/en translation resources for the renderer i18n foundation.
//   SCOPE: Phase-1 common navigation, status, upload, settings, onboarding, and error keys.
//   DEPENDS: none
//   LINKS: M-I18N, V-M-I18N
//   ROLE: TYPES
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   resources - i18next resource object for ru/en namespaces.
//   DEFAULT_LANGUAGE / FALLBACK_LANGUAGE - stable language constants.
// END_MODULE_MAP
export const DEFAULT_LANGUAGE = 'ru'
export const FALLBACK_LANGUAGE = 'en'

export const resources = {
  ru: {
    translation: {
      app: {
        title: 'WhisperAnnote',
        subtitle: 'Транскрибация и диаризация совещаний',
        gpuOnly: 'Только GPU (CUDA)'
      },
      nav: {
        upload: 'Транскрибация',
        results: 'Результаты',
        batch: 'Папка',
        settings: 'Настройки'
      },
      status: {
        backend: 'Backend',
        gpu: 'GPU',
        watcher: 'Наблюдение',
        ready: 'Готово',
        error: 'Ошибка'
      },
      upload: {
        dropzone: 'Перетащите аудио или видео файл',
        selectFile: 'Выбрать файл',
        transcribe: 'Расшифровать',
        model: 'Модель',
        numSpeakers: 'Количество спикеров'
      },
      settings: {
        title: 'Настройки',
        language: 'Язык',
        theme: 'Тема',
        outputFolder: 'Папка результатов',
        hfToken: 'HuggingFace токен'
      },
      onboarding: {
        title: 'Первый запуск',
        checkEnvironment: 'Проверка FFmpeg и CUDA',
        downloadModels: 'Загрузка моделей'
      },
      errors: {
        cudaUnavailable: 'CUDA GPU недоступен. CPU-режим не поддерживается.',
        unauthorized: 'Неверный секрет-токен backend.',
        ffmpegNotFound: 'FFmpeg не найден.'
      }
    }
  },
  en: {
    translation: {
      app: {
        title: 'WhisperAnnote',
        subtitle: 'Meeting transcription and diarization',
        gpuOnly: 'GPU only (CUDA)'
      },
      nav: {
        upload: 'Transcription',
        results: 'Results',
        batch: 'Folder',
        settings: 'Settings'
      },
      status: {
        backend: 'Backend',
        gpu: 'GPU',
        watcher: 'Watcher',
        ready: 'Ready',
        error: 'Error'
      },
      upload: {
        dropzone: 'Drop an audio or video file',
        selectFile: 'Select file',
        transcribe: 'Transcribe',
        model: 'Model',
        numSpeakers: 'Number of speakers'
      },
      settings: {
        title: 'Settings',
        language: 'Language',
        theme: 'Theme',
        outputFolder: 'Output folder',
        hfToken: 'HuggingFace token'
      },
      onboarding: {
        title: 'First run',
        checkEnvironment: 'Checking FFmpeg and CUDA',
        downloadModels: 'Downloading models'
      },
      errors: {
        cudaUnavailable: 'CUDA GPU is unavailable. CPU mode is not supported.',
        unauthorized: 'Invalid backend secret token.',
        ffmpegNotFound: 'FFmpeg was not found.'
      }
    }
  }
} as const

export type TranslationKey = keyof typeof resources.ru.translation
