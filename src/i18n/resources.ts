// FILE: src/i18n/resources.ts
// VERSION: 1.1.0
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
        transcribe: 'Транскрибация',
        results: 'Результаты',
        batch: 'Папка',
        settings: 'Настройки'
      },
      theme: {
        light: 'Светлая',
        dark: 'Тёмная'
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
        description: 'GPU закреплён за CUDA; CPU-режим недоступен в этом проекте.',
        language: 'Язык',
        theme: 'Тема',
        outputFolder: 'Папка результатов',
        hfToken: 'HuggingFace токен',
        loadFailed: 'Не удалось загрузить настройки',
        tokenStatusFailed: 'Не удалось проверить токен',
        saveFailed: 'Не удалось сохранить настройки',
        saved: 'Настройки сохранены',
        noBridge: 'Electron IPC недоступен',
        tokenRequired: 'Введите HF-токен',
        tokenSaved: 'HF-токен сохранён',
        tokenCleared: 'HF-токен удалён',
        modelTitle: 'Модель и устройство',
        autoSpeakers: 'Авто',
        device: 'Устройство',
        gpuFixed: 'Фиксировано контрактом проекта',
        outputTitle: 'Результаты',
        choose: 'Выбрать',
        outputFormats: 'Форматы вывода',
        generalTitle: 'Общие',
        themeSystem: 'Системная',
        themeLight: 'Светлая',
        themeDark: 'Тёмная',
        preferredPort: 'Порт backend',
        tokenPresent: 'Токен сохранён в защищённом хранилище',
        tokenMissing: 'Токен ещё не сохранён',
        saveToken: 'Сохранить токен',
        clearToken: 'Удалить токен'
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
        transcribe: 'Transcription',
        results: 'Results',
        batch: 'Folder',
        settings: 'Settings'
      },
      theme: {
        light: 'Light',
        dark: 'Dark'
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
        description: 'GPU is fixed to CUDA; CPU mode is unavailable in this project.',
        language: 'Language',
        theme: 'Theme',
        outputFolder: 'Output folder',
        hfToken: 'HuggingFace token',
        loadFailed: 'Failed to load settings',
        tokenStatusFailed: 'Failed to check token status',
        saveFailed: 'Failed to save settings',
        saved: 'Settings saved',
        noBridge: 'Electron IPC is unavailable',
        tokenRequired: 'Enter an HF token',
        tokenSaved: 'HF token saved',
        tokenCleared: 'HF token removed',
        modelTitle: 'Model and device',
        autoSpeakers: 'Auto',
        device: 'Device',
        gpuFixed: 'Fixed by project contract',
        outputTitle: 'Results',
        choose: 'Choose',
        outputFormats: 'Output formats',
        generalTitle: 'General',
        themeSystem: 'System',
        themeLight: 'Light',
        themeDark: 'Dark',
        preferredPort: 'Backend port',
        tokenPresent: 'Token is stored in secure storage',
        tokenMissing: 'Token has not been saved yet',
        saveToken: 'Save token',
        clearToken: 'Remove token'
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
