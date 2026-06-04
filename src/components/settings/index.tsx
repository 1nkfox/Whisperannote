// FILE: src/components/settings/index.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render Figma-styled persisted GPU-only application settings, output options, HF-token controls, and general preferences.
//   SCOPE: Store-backed renderer settings form, safe Electron IPC config persistence, folder selection, and HF-token status actions.
//   DEPENDS: M-STORES, M-UI, M-I18N, M-SHARED, React
//   LINKS: M-SETTINGS, V-M-SETTINGS, M-CONFIG-STORE
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   SettingsView - control-first settings tab for model, output, HF-token, language, theme, and preferred backend port.
// END_MODULE_MAP
import { useEffect, useState } from 'react'

import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Switch } from '../ui'
import { changeLanguage, useTranslation } from '../../i18n'
import { useSettingsStore } from '../../stores'
import type { AppConfig, AppLanguage, AppTheme, ElectronApi, OutputFormat, WhisperModel } from '../../shared'

type SettingsElectronApi = Pick<ElectronApi, 'invoke'>

export type SettingsViewProps = {
  electronApi?: SettingsElectronApi
}

const modelOptions: WhisperModel[] = [
  'faster-whisper-large-v3',
  'faster-whisper-large-v3-turbo',
  'faster-whisper-medium'
]

const outputFormatOptions: OutputFormat[] = ['json', 'txt', 'srt', 'docx']

function resolveElectronApi(explicit?: SettingsElectronApi): SettingsElectronApi | null {
  if (explicit) {
    return explicit
  }

  if (typeof window === 'undefined') {
    return null
  }

  return (window as Window & { electron?: SettingsElectronApi }).electron ?? null
}

function currentConfig(): AppConfig {
  const state = useSettingsStore.getState()
  return {
    language: state.language,
    theme: state.theme,
    model: state.model,
    numSpeakers: state.numSpeakers,
    outputFolder: state.outputFolder,
    outputFormats: state.outputFormats,
    watchFolder: state.watchFolder,
    watchEnabled: state.watchEnabled,
    cronExpression: state.cronExpression,
    preferredPort: state.preferredPort,
    firstRun: state.firstRun,
    hasHfToken: state.hasHfToken
  }
}

// START_CONTRACT: SettingsView
//   PURPOSE: Let the user edit approved app settings while preserving the fixed CUDA device invariant.
//   INPUTS: { props: SettingsViewProps - optional Electron IPC bridge for tests or runtime }
//   OUTPUTS: JSX.Element - settings view with persisted AppConfig controls
//   SIDE_EFFECTS: invokes Electron config/dialog IPC, updates M-STORES, changes renderer language
//   LINKS: M-SETTINGS, V-M-SETTINGS, M-STORES, M-UI, M-I18N, M-CONFIG-STORE
// END_CONTRACT: SettingsView
export function SettingsView({ electronApi }: SettingsViewProps) {
  const { t } = useTranslation()
  const bridge = resolveElectronApi(electronApi)
  const language = useSettingsStore((state) => state.language)
  const theme = useSettingsStore((state) => state.theme)
  const model = useSettingsStore((state) => state.model)
  const numSpeakers = useSettingsStore((state) => state.numSpeakers)
  const outputFolder = useSettingsStore((state) => state.outputFolder)
  const outputFormats = useSettingsStore((state) => state.outputFormats)
  const preferredPort = useSettingsStore((state) => state.preferredPort)
  const hasHfToken = useSettingsStore((state) => state.hasHfToken)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const applyConfig = useSettingsStore((state) => state.applyConfig)
  const setHasHfToken = useSettingsStore((state) => state.setHasHfToken)
  const [hfToken, setHfToken] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bridge) {
      return
    }

    // START_BLOCK_LOAD_PERSISTED_CONFIG
    void bridge
      .invoke('config:get', undefined)
      .then((config) => {
        applyConfig(config)
        void changeLanguage(config.language)
      })
      .catch(() => setError('Не удалось загрузить настройки'))

    void bridge
      .invoke('config:get-hf-token-status', undefined)
      .then(setHasHfToken)
      .catch(() => setError('Не удалось проверить токен'))
    // END_BLOCK_LOAD_PERSISTED_CONFIG
  }, [applyConfig, bridge, setHasHfToken])

  const persistPatch = async (patch: Partial<AppConfig>, successMessage: string) => {
    // START_BLOCK_PERSIST_SETTINGS
    updateSettings(patch)
    setError(null)

    try {
      const config = bridge ? await bridge.invoke('config:set', patch) : { ...currentConfig(), ...patch }
      applyConfig(config)
      if (patch.language) {
        await changeLanguage(patch.language)
      }
      setMessage(successMessage)
    } catch (persistError) {
      setError(persistError instanceof Error ? persistError.message : t('settings.saveFailed', 'Не удалось сохранить настройки'))
    }
    // END_BLOCK_PERSIST_SETTINGS
  }

  const toggleOutputFormat = (format: OutputFormat) => {
    const next = outputFormats.includes(format)
      ? outputFormats.filter((entry) => entry !== format)
      : [...outputFormats, format]

    void persistPatch({ outputFormats: next.length ? next : ['json'] }, t('settings.saved', 'Настройки сохранены'))
  }

  const chooseOutputFolder = async () => {
    if (!bridge) {
      setError(t('settings.noBridge', 'Electron IPC недоступен'))
      return
    }

    const folder = await bridge.invoke('dialog:select-folder', undefined)
    if (folder) {
      await persistPatch({ outputFolder: folder }, t('settings.saved', 'Настройки сохранены'))
    }
  }

  const saveHfToken = async () => {
    if (!bridge) {
      setError(t('settings.noBridge', 'Electron IPC недоступен'))
      return
    }

    if (!hfToken.trim()) {
      setError(t('settings.tokenRequired', 'Введите HF-токен'))
      return
    }

    // START_BLOCK_HF_TOKEN_SECURE_IPC
    await bridge.invoke('config:set-hf-token', { token: hfToken.trim() })
    setHfToken('')
    setHasHfToken(true)
    setMessage(t('settings.tokenSaved', 'HF-токен сохранён'))
    // END_BLOCK_HF_TOKEN_SECURE_IPC
  }

  const clearHfToken = async () => {
    if (!bridge) {
      setError(t('settings.noBridge', 'Electron IPC недоступен'))
      return
    }

    await bridge.invoke('config:clear-hf-token', undefined)
    setHasHfToken(false)
    setMessage(t('settings.tokenCleared', 'HF-токен удалён'))
  }

  return (
    <section className="space-y-6" aria-label={t('settings.title', 'Настройки')}>
      {message ? <div role="status" className="rounded-sm border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{message}</div> : null}
      {error ? <div role="alert" className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6C7278]">Model</p>
            <CardTitle>{t('settings.modelTitle', 'Модель и устройство')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-model">{t('upload.model', 'Модель')}</Label>
              <Select
                id="settings-model"
                value={model}
                onChange={(event) => void persistPatch({ model: event.target.value as WhisperModel }, t('settings.saved', 'Настройки сохранены'))}
              >
                {modelOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="settings-speakers">{t('upload.numSpeakers', 'Количество спикеров')}</Label>
                <Input
                  id="settings-speakers"
                  type="number"
                  min={1}
                  value={numSpeakers ?? ''}
                  placeholder={t('settings.autoSpeakers', 'Авто')}
                  onChange={(event) => {
                    const value = event.target.value
                    void persistPatch({ numSpeakers: value ? Number(value) : null }, t('settings.saved', 'Настройки сохранены'))
                  }}
                />
              </div>
              <div className="rounded-[4px] border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6C7278]">{t('settings.device', 'Устройство')}</div>
                <div className="mt-1 font-semibold">GPU CUDA</div>
                <div className="mt-1 text-xs text-[#6C7278]">{t('settings.gpuFixed', 'Фиксировано контрактом проекта')}</div>
              </div>
              <div className="rounded-[4px] border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] p-3 text-sm opacity-65 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6C7278]">CPU</div>
                <div className="mt-1 font-semibold">Недоступен</div>
                <div className="mt-1 text-xs text-[#6C7278]">GPU-only invariant</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6C7278]">Save path</p>
            <CardTitle>{t('settings.outputTitle', 'Результаты')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="settings-output-folder">{t('settings.outputFolder', 'Папка результатов')}</Label>
              <div className="flex gap-2">
                <Input
                  id="settings-output-folder"
                  value={outputFolder}
                  placeholder="H:/Meetings/Output"
                  onChange={(event) => void persistPatch({ outputFolder: event.target.value }, t('settings.saved', 'Настройки сохранены'))}
                />
                <Button variant="secondary" onClick={() => void chooseOutputFolder()}>{t('settings.choose', 'Выбрать')}</Button>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('settings.outputFormats', 'Форматы вывода')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {outputFormatOptions.map((format) => (
                  <div key={format} className="flex items-center justify-between rounded-[4px] border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                    <span className="font-medium">{format.toUpperCase()}</span>
                    <Switch
                      aria-label={`${format.toUpperCase()} format`}
                      checked={outputFormats.includes(format)}
                      onClick={() => toggleOutputFormat(format)}
                    />
                  </div>
                ))}
              </div>
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6C7278]">Application</p>
            <CardTitle>{t('settings.generalTitle', 'Общие')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="settings-language">{t('settings.language', 'Язык')}</Label>
              <Select
                id="settings-language"
                value={language}
                onChange={(event) => void persistPatch({ language: event.target.value as AppLanguage }, t('settings.saved', 'Настройки сохранены'))}
              >
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-theme">{t('settings.theme', 'Тема')}</Label>
              <Select
                id="settings-theme"
                value={theme}
                onChange={(event) => void persistPatch({ theme: event.target.value as AppTheme }, t('settings.saved', 'Настройки сохранены'))}
              >
                <option value="system">{t('settings.themeSystem', 'Системная')}</option>
                <option value="light">{t('settings.themeLight', 'Светлая')}</option>
                <option value="dark">{t('settings.themeDark', 'Тёмная')}</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-port">{t('settings.preferredPort', 'Порт backend')}</Label>
              <Input
                id="settings-port"
                type="number"
                min={1024}
                value={preferredPort ?? ''}
                placeholder="8777"
                onChange={(event) => {
                  const value = event.target.value
                  void persistPatch({ preferredPort: value ? Number(value) : null }, t('settings.saved', 'Настройки сохранены'))
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6C7278]">Secure storage</p>
            <CardTitle>{t('settings.hfToken', 'HuggingFace токен')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[4px] border border-[rgba(108,114,120,0.2)] bg-[#F7F5F2] p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              {hasHfToken ? t('settings.tokenPresent', 'Токен сохранён в защищённом хранилище') : t('settings.tokenMissing', 'Токен ещё не сохранён')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-hf-token">{t('settings.hfToken', 'HuggingFace токен')}</Label>
              <Input
                id="settings-hf-token"
                type="password"
                autoComplete="off"
                value={hfToken}
                onChange={(event) => setHfToken(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void saveHfToken()}>{t('settings.saveToken', 'Сохранить токен')}</Button>
              <Button variant="secondary" onClick={() => void clearHfToken()}>{t('settings.clearToken', 'Удалить токен')}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - Removed the Advanced settings header card so settings open directly on controls.
//   LAST_CHANGE: v1.2.0 - Flattened settings surfaces and reduced tertiary accent use to align with Heritage single-accent guidance.
//   LAST_CHANGE: v1.1.0 - Ported the Figma advanced-settings card language, GPU/CPU device presentation, output chips, and status surfaces.
//   LAST_CHANGE: v1.0.0 - Implemented Phase-6 settings view with GPU-only settings persistence and secure HF-token IPC.
// END_CHANGE_SUMMARY
