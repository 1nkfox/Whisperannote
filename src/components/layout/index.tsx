// FILE: src/components/layout/index.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render a compact frameless renderer shell with tab navigation, window controls, status rail, and theme switching.
//   SCOPE: Layout-only React components that read renderer stores and i18n; no backend requests or file access.
//   DEPENDS: React, src/components/ui, src/i18n, src/stores
//   LINKS: M-APP-SHELL, V-M-APP-SHELL, M-UI, M-I18N, M-STORES
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   AppShell - compact shell with draggable top bar, window controls, content slot, tab navigation, and status rail.
//   ShellTab - navigation tab identifiers used by Phase-4 views.
// END_MODULE_MAP
import React, { useEffect } from 'react'

import { Badge, Separator, cn } from '../ui'
import { useTranslation } from '../../i18n'
import { useBackendStore, useSettingsStore } from '../../stores'
import type { ElectronApi } from '../../shared'

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

function resolveWindowControlBridge(): Pick<ElectronApi, 'invoke'> | null {
  if (typeof window === 'undefined') {
    return null
  }

  return (window as Window & { electron?: Pick<ElectronApi, 'invoke'> }).electron ?? null
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
  const windowBridge = resolveWindowControlBridge()

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
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[#F7F5F2] text-[#1A1C1E] dark:bg-zinc-950 dark:text-zinc-50">
      <header className="wa-app-drag shrink-0 border-b border-[rgba(108,114,120,0.2)] px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <nav aria-label="Main navigation" className="wa-app-no-drag flex flex-wrap gap-x-6 gap-y-2">
            {navigation.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={cn(
                  'text-xs font-semibold uppercase tracking-[0.12em] transition-colors',
                  activeTab === item.id ? 'text-[#B8422E]' : 'text-[#6C7278] hover:text-[#1A1C1E] dark:hover:text-zinc-50'
                )}
                onClick={() => onTabChange?.(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 justify-end gap-2" data-testid="window-controls">
            <button
              type="button"
              aria-label="Toggle theme"
              className="wa-app-no-drag flex h-8 w-8 items-center justify-center rounded-[4px] border border-[rgba(108,114,120,0.28)] text-[#6C7278] transition-colors hover:border-[#1A1C1E] hover:text-[#1A1C1E] dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-200 dark:hover:text-zinc-50"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              ◐
            </button>
          <button
            type="button"
            aria-label="Minimize window"
            className="wa-app-no-drag flex h-8 w-8 items-center justify-center rounded-[4px] border border-[rgba(108,114,120,0.28)] text-[#6C7278] transition-colors hover:border-[#1A1C1E] hover:text-[#1A1C1E] dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-200 dark:hover:text-zinc-50"
            onClick={() => void windowBridge?.invoke('window:minimize', undefined)}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Close window"
            className="wa-app-no-drag flex h-8 w-8 items-center justify-center rounded-[4px] border border-[rgba(108,114,120,0.28)] text-[#6C7278] transition-colors hover:border-[#B8422E] hover:bg-[#B8422E] hover:text-white dark:border-zinc-700 dark:text-zinc-400"
            onClick={() => void windowBridge?.invoke('window:close', undefined)}
          >
            ×
          </button>
        </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden px-4 py-4 sm:px-6">
        <div className="mx-auto h-full max-w-7xl overflow-hidden">
        {children}
        </div>
      </main>

      <footer className="shrink-0 border-t border-[rgba(108,114,120,0.2)] px-4 py-2 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
          <Badge variant={backendStatus.healthy ? 'success' : 'outline'}>
            Backend: {backendStatus.healthy ? 'online' : 'offline'}
          </Badge>
          <Badge variant={health?.cuda_available ? 'success' : 'warning'}>
            GPU: {health?.cuda_available ? `${health.cuda_devices} CUDA` : 'unknown'}
          </Badge>
          <Badge variant={watcher.watching ? 'success' : 'outline'}>
            Watcher: {watcher.watching ? 'on' : 'off'}
          </Badge>
          <Separator className="hidden h-4 w-px sm:block" />
          <span className="text-[#6C7278]">v0.2.0</span>
        </div>
      </footer>
    </div>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.5.0 - Removed masthead/current-section bands and collapsed shell into a compact scrollbar-free top bar.
//   LAST_CHANGE: v1.4.0 - Made the frameless shell header draggable while keeping window/nav controls interactive.
//   LAST_CHANGE: v1.3.0 - Added frameless minimize/close controls in the top-right shell chrome.
//   LAST_CHANGE: v1.2.0 - Reworked shell toward Heritage editorial layout with large serif masthead, text nav, and flat status rail.
//   LAST_CHANGE: v1.1.0 - Ported the Figma top-header shell, cream workspace, tab bar, and floating status strip while preserving theme/store behavior.
//   LAST_CHANGE: v1.0.0 - Implemented Phase-4 app shell with navigation, status bar, and theme switching.
// END_CHANGE_SUMMARY
