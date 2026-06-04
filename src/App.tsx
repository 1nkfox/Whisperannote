// FILE: src/App.tsx
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Render the application shell, discover the local backend, and route runtime feature views.
//   SCOPE: Shell composition, backend API client bootstrap, manual transcription, batch, and settings routes.
//   DEPENDS: React, src/components/layout, src/components/upload, src/components/transcription, src/components/batch, src/components/settings, src/lib/api, src/stores
//   LINKS: M-APP-SHELL, M-UPLOAD, M-RESULTS, M-BATCH, M-SETTINGS, M-API-CLIENT
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   App - renderer root that bootstraps Electron backend info and routes manual/batch/settings views.
//   resolveElectronApi - runtime-safe lookup for the preload bridge.
// END_MODULE_MAP
import { useEffect, useMemo, useState } from 'react'

import { BatchView } from './components/batch'
import { AppShell, type ShellTab } from './components/layout'
import { SettingsView } from './components/settings'
import { ResultsView } from './components/transcription'
import { UploadView } from './components/upload'
import { api } from './lib/api'
import { useBackendStore, useSettingsStore, useTranscriptionStore } from './stores'
import type { BackendInfo, ElectronApi } from './shared'

function resolveElectronApi(): Pick<ElectronApi, 'invoke'> | null {
  if (typeof window === 'undefined') {
    return null
  }

  return (window as Window & { electron?: Pick<ElectronApi, 'invoke'> }).electron ?? null
}

export function App() {
  const [activeTab, setActiveTab] = useState<ShellTab>('transcribe')
  const [backendInfo, setBackendInfo] = useState<BackendInfo | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const applyConfig = useSettingsStore((state) => state.applyConfig)
  const setHasHfToken = useSettingsStore((state) => state.setHasHfToken)
  const setStatus = useBackendStore((state) => state.setStatus)
  const activeTaskId = useTranscriptionStore((state) => state.activeTaskId)
  const activeResult = useTranscriptionStore((state) => {
    if (!state.activeTaskId) {
      return null
    }

    return state.results[state.activeTaskId] ?? state.tasks[state.activeTaskId]?.result ?? null
  })
  const upsertTask = useTranscriptionStore((state) => state.upsertTask)
  const setTaskResult = useTranscriptionStore((state) => state.setTaskResult)
  const client = useMemo(
    () => backendInfo ? api.create({ baseUrl: backendInfo.baseUrl, wsBaseUrl: backendInfo.wsBaseUrl, token: backendInfo.token }) : null,
    [backendInfo]
  )

  useEffect(() => {
    const bridge = resolveElectronApi()

    if (!bridge) {
      setBootError('Electron IPC недоступен: приложение должно запускаться через Electron, не как обычная web-страница.')
      return undefined
    }

    let cancelled = false

    // START_BLOCK_BOOTSTRAP_BACKEND
    void Promise
      .all([
        bridge.invoke('config:get', undefined),
        bridge.invoke('config:get-hf-token-status', undefined),
        bridge.invoke('backend:get-info', undefined),
        bridge.invoke('backend:get-status', undefined)
      ])
      .then(([config, hasToken, info, status]) => {
        if (cancelled) {
          return
        }

        applyConfig({ ...config, hasHfToken: hasToken })
        setHasHfToken(hasToken)
        setStatus(status)

        if (!info) {
          throw new Error('Backend не запущен')
        }

        setBackendInfo(info)
        setBootError(null)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : 'Не удалось инициализировать backend')
        }
      })
    // END_BLOCK_BOOTSTRAP_BACKEND

    return () => {
      cancelled = true
    }
  }, [applyConfig, setHasHfToken, setStatus])

  useEffect(() => {
    if (!client || !activeTaskId) {
      return undefined
    }

    let disposed = false

    const refreshTask = async () => {
      try {
        const tasks = await client.queueStatus()

        if (disposed) {
          return
        }

        for (const task of tasks) {
          upsertTask(task)

          if (task.result) {
            setTaskResult(task.task_id, task.result)
          }
        }
      } catch (error) {
        useBackendStore
          .getState()
          .setLastError(error instanceof Error ? error.message : 'Не удалось обновить статус задачи')
      }
    }

    void refreshTask()
    const timer = setInterval(() => void refreshTask(), 1500)

    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [activeTaskId, client, setTaskResult, upsertTask])

  const renderContent = () => {
    if (bootError || !client || !backendInfo) {
      return (
        <section className="space-y-3" role="alert">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-red-600">Backend bootstrap</p>
          <h1 className="text-2xl font-semibold">Backend недоступен</h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">{bootError ?? 'Ожидание локального backend...'}</p>
        </section>
      )
    }

    if (activeTab === 'batch') {
      return <BatchView client={client} />
    }

    if (activeTab === 'settings') {
      return <SettingsView />
    }

    return (
      <section className="grid h-full min-h-0 gap-4 overflow-hidden xl:grid-rows-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <UploadView client={client} />
        <ResultsView result={activeResult} />
      </section>
    )
  }

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </AppShell>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.7.0 - Constrained transcribe route to the shell viewport to avoid page-level scrollbars.
//   LAST_CHANGE: v1.6.0 - Removed runtime first-run onboarding so the app opens directly to the main interface.
//   LAST_CHANGE: v1.5.0 - Let batch/settings tabs route even while first-run onboarding remains active on the transcribe tab.
//   LAST_CHANGE: v1.4.0 - Connected renderer bootstrap to backend info, first-run onboarding, manual upload/results, and batch API client.
//   LAST_CHANGE: v1.3.0 - Routed the settings tab to M-SETTINGS SettingsView.
// END_CHANGE_SUMMARY
