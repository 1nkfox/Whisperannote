// FILE: src/components/onboarding/index.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render the first-run wizard for CUDA environment checks, HF-token readiness, and model download progress.
//   SCOPE: Backend health check, user-visible CUDA/FFmpeg errors, secure-token readiness display, model download trigger, and WS progress display.
//   DEPENDS: M-API-CLIENT, M-STORES, M-UI, M-I18N, M-SHARED, React
//   LINKS: M-ONBOARDING, V-M-ONBOARDING, M-MODELS, M-PROGRESS
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   FirstRunWizard - first-run readiness flow with health, token, model download, and completion controls.
//   ModelDownload - selected-model download card driven by API call and WS progress state.
// END_MODULE_MAP
import { useEffect, useMemo, useState } from 'react'

import { useWebSocket, type ApiClient } from '../../lib/api'
import { useTranslation } from '../../i18n'
import { useBackendStore, useSettingsStore } from '../../stores'
import type { BackendInfo, ElectronApi, HealthStatus, WSMessage } from '../../shared'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Progress, Select } from '../ui'

type OnboardingElectronApi = Pick<ElectronApi, 'invoke'>

export type FirstRunWizardProps = {
  client: Pick<ApiClient, 'health' | 'models' | 'downloadModel' | 'queueStatus'>
  electronApi?: OnboardingElectronApi
  backendInfo?: Pick<BackendInfo, 'wsBaseUrl' | 'token'>
  onReady?: () => void
}

export type ModelDownloadProps = {
  client: Pick<ApiClient, 'downloadModel' | 'queueStatus'>
  model: string
  wsBaseUrl: string
  token: string
  disabled?: boolean
  onDownloaded?: () => void
}

function resolveElectronApi(explicit?: OnboardingElectronApi): OnboardingElectronApi | null {
  if (explicit) {
    return explicit
  }

  if (typeof window === 'undefined') {
    return null
  }

  return (window as Window & { electron?: OnboardingElectronApi }).electron ?? null
}

function healthIssues(health: HealthStatus | null): string[] {
  if (!health) {
    return []
  }

  const issues: string[] = []

  if (!health.cuda_available) {
    issues.push('CUDA_UNAVAILABLE')
  }

  if (health.status === 'ffmpeg_missing') {
    issues.push('FFMPEG_NOT_FOUND')
  }

  return issues
}

function progressPercent(message: WSMessage | null): number {
  if (!message) {
    return 0
  }

  if (message.type === 'progress') {
    return message.percent
  }

  if (message.type === 'complete') {
    return 100
  }

  return 0
}

// START_CONTRACT: ModelDownload
//   PURPOSE: Start selected model download and display progress streamed over the model-specific WS channel.
//   INPUTS: { props: ModelDownloadProps - API client, model, WS base URL/token, disabled state, completion callback }
//   OUTPUTS: JSX.Element - download control with progressbar and status text
//   SIDE_EFFECTS: calls POST /api/models/download and opens model progress WebSocket via M-API-CLIENT
//   LINKS: M-ONBOARDING, V-M-ONBOARDING, M-API-CLIENT, M-PROGRESS
// END_CONTRACT: ModelDownload
export function ModelDownload({ client, model, wsBaseUrl, token, disabled = false, onDownloaded }: ModelDownloadProps) {
  const { t } = useTranslation()
  const [activeModel, setActiveModel] = useState<string | null>(null)
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'complete' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const wsState = useWebSocket({
    taskId: activeModel ? `model:${activeModel}` : null,
    client,
    wsBaseUrl,
    token
  })
  const percent = progressPercent(wsState.lastMessage)

  const startDownload = async () => {
    // START_BLOCK_MODEL_DOWNLOAD
    setActiveModel(model)
    setDownloadState('downloading')
    setError(null)

    try {
      await client.downloadModel(model)
      setDownloadState('complete')
      onDownloaded?.()
    } catch (downloadError) {
      setDownloadState('error')
      setError(downloadError instanceof Error ? downloadError.message : t('onboarding.downloadFailed', 'Не удалось загрузить модель'))
    }
    // END_BLOCK_MODEL_DOWNLOAD
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('onboarding.downloadModels', 'Загрузка моделей')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{model}</p>
        <Progress value={downloadState === 'complete' ? 100 : percent} />
        <div role="status" className="text-sm text-zinc-600 dark:text-zinc-300">
          {downloadState === 'complete'
            ? t('onboarding.modelsReady', 'Модели готовы')
            : wsState.lastMessage?.type === 'progress'
              ? wsState.lastMessage.message ?? `${wsState.lastMessage.percent}%`
              : t('onboarding.waitingProgress', 'Ожидание прогресса')}
        </div>
        {error ? <div role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</div> : null}
        <Button disabled={disabled || downloadState === 'downloading'} onClick={() => void startDownload()}>
          {t('onboarding.startDownload', 'Загрузить модель')}
        </Button>
      </CardContent>
    </Card>
  )
}

// START_CONTRACT: FirstRunWizard
//   PURPOSE: Guide first-run readiness by checking CUDA/FFmpeg, confirming HF token, downloading models, and marking firstRun false.
//   INPUTS: { props: FirstRunWizardProps - API client, optional Electron bridge/backend info, optional ready callback }
//   OUTPUTS: JSX.Element - onboarding wizard UI
//   SIDE_EFFECTS: calls backend health/models/download APIs, invokes config IPC, mutates settings/backend stores
//   LINKS: M-ONBOARDING, V-M-ONBOARDING, M-API-CLIENT, M-STORES, M-UI, M-CONFIG-STORE
// END_CONTRACT: FirstRunWizard
export function FirstRunWizard({ client, electronApi, backendInfo, onReady }: FirstRunWizardProps) {
  const { t } = useTranslation()
  const bridge = resolveElectronApi(electronApi)
  const model = useSettingsStore((state) => state.model)
  const hasHfToken = useSettingsStore((state) => state.hasHfToken)
  const setModel = useSettingsStore((state) => state.setModel)
  const setHasHfToken = useSettingsStore((state) => state.setHasHfToken)
  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const setHealth = useBackendStore((state) => state.setHealth)
  const [health, setLocalHealth] = useState<HealthStatus | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([model])
  const [downloadedModels, setDownloadedModels] = useState<string[]>([])
  const [hfToken, setHfToken] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resolvedWsBaseUrl = backendInfo?.wsBaseUrl ?? ''
  const resolvedToken = backendInfo?.token ?? ''

  useEffect(() => {
    if (!bridge) {
      return
    }

    void bridge.invoke('config:get-hf-token-status', undefined).then(setHasHfToken)
  }, [bridge, setHasHfToken])

  const issues = useMemo(() => healthIssues(health), [health])
  const environmentReady = Boolean(health && issues.length === 0)
  const selectedModelReady = downloadedModels.includes(model) || health?.models_cached.includes(model)
  const ready = environmentReady && hasHfToken && selectedModelReady

  const checkHealth = async () => {
    // START_BLOCK_CHECK_ENV
    console.info('[Onboarding][checkHealth][BLOCK_CHECK_ENV] checking backend environment', {
      stage: 'health-check',
      task_id: 'first-run'
    })

    try {
      const nextHealth = await client.health()
      const models = await client.models()
      setLocalHealth(nextHealth)
      setHealth(nextHealth)
      setAvailableModels(models.available.length ? models.available : [model])
      setDownloadedModels(models.downloaded)
      setError(null)
    } catch (healthError) {
      setError(healthError instanceof Error ? healthError.message : t('onboarding.healthFailed', 'Не удалось проверить окружение'))
    }
    // END_BLOCK_CHECK_ENV
  }

  const saveToken = async () => {
    if (!bridge) {
      setError(t('settings.noBridge', 'Electron IPC недоступен'))
      return
    }

    if (!hfToken.trim()) {
      setError(t('settings.tokenRequired', 'Введите HF-токен'))
      return
    }

    await bridge.invoke('config:set-hf-token', { token: hfToken.trim() })
    setHfToken('')
    setHasHfToken(true)
    setMessage(t('settings.tokenSaved', 'HF-токен сохранён'))
  }

  const completeOnboarding = async () => {
    const patch = { firstRun: false }
    updateSettings(patch)
    if (bridge) {
      await bridge.invoke('config:set', patch)
    }
    onReady?.()
  }

  return (
    <section className="space-y-4" aria-label={t('onboarding.title', 'Первый запуск')}>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">M-ONBOARDING</p>
        <h1 className="text-2xl font-semibold">{t('onboarding.title', 'Первый запуск')}</h1>
        <p className="max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          {t('onboarding.description', 'Проверьте CUDA, сохраните HF-токен и загрузите модели перед первой транскрибацией.')}
        </p>
      </div>

      {message ? <div role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{message}</div> : null}
      {error ? <div role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('onboarding.checkEnvironment', 'Проверка FFmpeg и CUDA')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => void checkHealth()}>{t('onboarding.checkNow', 'Проверить окружение')}</Button>
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-zinc-500">CUDA</div>
                <div>{health?.cuda_available ? `${health.cuda_devices} GPU` : t('errors.cudaUnavailable', 'CUDA GPU недоступен. CPU-режим не поддерживается.')}</div>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="text-zinc-500">FFmpeg</div>
                <div>{health?.status === 'ffmpeg_missing' ? t('errors.ffmpegNotFound', 'FFmpeg не найден.') : t('onboarding.ffmpegReady', 'Нет ошибки от backend health')}</div>
              </div>
            </div>
            {issues.includes('CUDA_UNAVAILABLE') ? <div role="alert" className="text-sm text-red-700 dark:text-red-300">{t('errors.cudaUnavailable', 'CUDA GPU недоступен. CPU-режим не поддерживается.')}</div> : null}
            {issues.includes('FFMPEG_NOT_FOUND') ? <div role="alert" className="text-sm text-red-700 dark:text-red-300">{t('errors.ffmpegNotFound', 'FFmpeg не найден.')}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.hfToken', 'HuggingFace токен')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              {hasHfToken ? t('settings.tokenPresent', 'Токен сохранён в защищённом хранилище') : t('settings.tokenMissing', 'Токен ещё не сохранён')}
            </div>
            <Label htmlFor="onboarding-hf-token">{t('settings.hfToken', 'HuggingFace токен')}</Label>
            <Input id="onboarding-hf-token" type="password" autoComplete="off" value={hfToken} onChange={(event) => setHfToken(event.target.value)} />
            <Button onClick={() => void saveToken()}>{t('settings.saveToken', 'Сохранить токен')}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('upload.model', 'Модель')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="onboarding-model">{t('upload.model', 'Модель')}</Label>
            <Select id="onboarding-model" value={model} onChange={(event) => setModel(event.target.value as typeof model)}>
              {availableModels.map((availableModel) => (
                <option key={availableModel} value={availableModel}>{availableModel}</option>
              ))}
            </Select>
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              {selectedModelReady ? t('onboarding.modelsReady', 'Модели готовы') : t('onboarding.modelsMissing', 'Модель ещё не загружена')}
            </div>
          </CardContent>
        </Card>

        <ModelDownload
          client={client}
          model={model}
          wsBaseUrl={resolvedWsBaseUrl}
          token={resolvedToken}
          disabled={!environmentReady || !hasHfToken || !resolvedWsBaseUrl || !resolvedToken}
          onDownloaded={() => setDownloadedModels((current) => (current.includes(model) ? current : [...current, model]))}
        />
      </div>

      <div className="flex justify-end">
        <Button disabled={!ready} onClick={() => void completeOnboarding()}>{t('onboarding.finish', 'Завершить первый запуск')}</Button>
      </div>
    </section>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Implemented Phase-6 first-run wizard with CUDA gate, secure token entry, and model download progress.
// END_CHANGE_SUMMARY
