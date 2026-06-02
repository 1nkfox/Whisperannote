// FILE: src/App.tsx
// VERSION: 1.2.0
// START_MODULE_CONTRACT
//   PURPOSE: Render the application shell and route implemented feature views.
//   SCOPE: Shell composition and local tab selection; feature logic remains in dedicated modules.
//   DEPENDS: React, src/components/layout, src/components/batch, src/components/settings
//   LINKS: M-APP-SHELL, M-BATCH, M-SETTINGS, Phase-6
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   App - renderer root using AppShell with batch and settings routes.
// END_MODULE_MAP
import { useState } from 'react'

import { BatchView } from './components/batch'
import { AppShell, type ShellTab } from './components/layout'
import { SettingsView } from './components/settings'
import { api } from './lib/api'

export function App() {
  const [activeTab, setActiveTab] = useState<ShellTab>('transcribe')
  const batchClient = api.create({ baseUrl: '', token: '' })

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'batch' ? (
        <BatchView client={batchClient} />
      ) : activeTab === 'settings' ? (
        <SettingsView />
      ) : (
        <section className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Phase 5</p>
          <h1 className="text-2xl font-semibold">Manual transcription workspace</h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            Upload and results modules are available as dedicated Phase-4 components.
          </p>
        </section>
      )}
    </AppShell>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - Routed the settings tab to M-SETTINGS SettingsView.
// END_CHANGE_SUMMARY
