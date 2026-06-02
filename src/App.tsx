// FILE: src/App.tsx
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Render the application shell and route implemented feature views.
//   SCOPE: Shell composition and local tab selection; feature logic remains in dedicated modules.
//   DEPENDS: React, src/components/layout, src/components/batch
//   LINKS: M-APP-SHELL, M-BATCH, Phase-5
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   App - renderer root using AppShell and Phase-4 tab placeholders.
// END_MODULE_MAP
import { useState } from 'react'

import { BatchView } from './components/batch'
import { AppShell, type ShellTab } from './components/layout'
import { api } from './lib/api'

export function App() {
  const [activeTab, setActiveTab] = useState<ShellTab>('transcribe')
  const batchClient = api.create({ baseUrl: '', token: '' })

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'batch' ? (
        <BatchView client={batchClient} />
      ) : (
        <section className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Phase 5</p>
          <h1 className="text-2xl font-semibold">Manual transcription workspace</h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            {activeTab === 'transcribe'
              ? 'Upload and results modules are available as dedicated Phase-4 components.'
              : 'This tab is reserved for a later module in the approved development plan.'}
          </p>
        </section>
      )}
    </AppShell>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.2.0 - Routed the batch tab to M-BATCH BatchView.
// END_CHANGE_SUMMARY
