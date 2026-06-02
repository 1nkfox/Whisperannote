// FILE: src/components/layout/index.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render the main renderer shell with sidebar navigation, header/title bar, status bar, and theme switching.
//   SCOPE: Layout-only React components that read renderer stores and i18n; no backend requests or file access.
//   DEPENDS: React, src/components/ui, src/i18n, src/stores
//   LINKS: M-APP-SHELL, V-M-APP-SHELL, M-UI, M-I18N, M-STORES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   AppShell - complete shell with header, sidebar, content slot, and status bar.
//   ShellTab - navigation tab identifiers used by Phase-4 views.
// END_MODULE_MAP
import React, { useEffect } from 'react'

import { Badge, Button, Card, CardContent, Separator, cn } from '../ui'
import { useTranslation } from '../../i18n'
import { useBackendStore, useSettingsStore } from '../../stores'

export type ShellTab = 'transcribe' | 'batch' | 'settings'

export type AppShellProps = {
  activeTab?: ShellTab
  onTabChange?: (tab: ShellTab) => void
  children: React.ReactNode
}

type NavigationItem = {
  id: ShellTab
  label: string
}

function resolveThemeClass(theme: string): 'light' | 'dark' {
  if (theme === 'dark') {
    return 'dark'
  }

  return 'light'
}

// START_CONTRACT: AppShell
//   PURPOSE: Compose the application frame with navigation, frameless title area, status bar, and theme class hooks.
//   INPUTS: { props: AppShellProps - active tab, tab-change callback, and content children }
//   OUTPUTS: JSX.Element - renderer layout
//   SIDE_EFFECTS: updates documentElement light/dark classes from settings store
//   LINKS: M-APP-SHELL, V-M-APP-SHELL, M-UI, M-I18N, M-STORES
// END_CONTRACT: AppShell
export function AppShell({ activeTab = 'transcribe', onTabChange, children }: AppShellProps) {
  const { t } = useTranslation()
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const backendStatus = useBackendStore((state) => state.status)
  const health = useBackendStore((state) => state.health)
  const watcher = useBackendStore((state) => state.watcher)

  useEffect(() => {
    // START_BLOCK_THEME_APPLY
    const root = document.documentElement
    const resolved = resolveThemeClass(theme)
    root.classList.toggle('dark', resolved === 'dark')
    root.classList.toggle('light', resolved === 'light')
    // END_BLOCK_THEME_APPLY
  }, [theme])

  const navigation: NavigationItem[] = [
    { id: 'transcribe', label: t('nav.transcribe', 'Транскрибация') },
    { id: 'batch', label: t('nav.batch', 'Пакетная обработка') },
    { id: 'settings', label: t('nav.settings', 'Настройки') }
  ]

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="grid min-h-screen grid-cols-1 md:grid-cols-[240px_1fr]">
        <aside className="border-b border-zinc-200 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/80 md:border-b-0 md:border-r">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">WhisperAnnote</p>
            <h1 className="mt-2 text-xl font-semibold">{t('app.title', 'Русские совещания')}</h1>
          </div>
          <nav aria-label="Main navigation" className="flex gap-2 md:flex-col">
            {navigation.map((item) => (
              <Button
                key={item.id}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={cn('justify-start', activeTab === item.id && 'ring-2 ring-zinc-400')}
                variant={activeTab === item.id ? 'default' : 'ghost'}
                onClick={() => onTabChange?.(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center sm:justify-between">
            <div className="select-none" data-testid="title-bar">
              <p className="text-xs text-zinc-500">GPU-only CUDA pipeline</p>
              <h2 className="text-lg font-semibold">{navigation.find((item) => item.id === activeTab)?.label}</h2>
            </div>
            <Button
              aria-label="Toggle theme"
              variant="secondary"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? t('theme.light', 'Светлая') : t('theme.dark', 'Тёмная')}
            </Button>
          </header>

          <main className="flex-1 p-4">
            <Card className="min-h-[calc(100vh-11rem)]">
              <CardContent className="p-4 sm:p-6">{children}</CardContent>
            </Card>
          </main>

          <footer className="border-t border-zinc-200 bg-white px-4 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={backendStatus.healthy ? 'success' : 'secondary'}>
                Backend: {backendStatus.healthy ? 'online' : 'offline'}
              </Badge>
              <Badge variant={health?.cuda_available ? 'success' : 'destructive'}>
                GPU: {health?.cuda_available ? `${health.cuda_devices} CUDA` : 'unknown'}
              </Badge>
              <Badge variant={watcher.watching ? 'success' : 'secondary'}>
                Watcher: {watcher.watching ? 'on' : 'off'}
              </Badge>
              <Separator className="hidden h-4 w-px sm:block" />
              <span className="text-zinc-500">v0.2.0</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.0.0 - Implemented Phase-4 app shell with navigation, status bar, and theme switching.
// END_CHANGE_SUMMARY
