// FILE: src/App.tsx
// VERSION: 1.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Render the Phase-4 application shell and route placeholders for pending feature views.
//   SCOPE: Shell composition and local tab selection; feature-specific upload/results logic remains in dedicated modules.
//   DEPENDS: React, src/components/layout
//   LINKS: M-APP-SHELL, Phase-4
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   App - renderer root using AppShell and Phase-4 tab placeholders.
// END_MODULE_MAP
import { useState } from 'react'

import { AppShell, type ShellTab } from './components/layout'

export function App() {
  const [activeTab, setActiveTab] = useState<ShellTab>('transcribe')

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      <section className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Phase 4</p>
        <h1 className="text-2xl font-semibold">Manual transcription workspace</h1>
        <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
          {activeTab === 'transcribe'
            ? 'Upload and results modules will fill this workspace during the next GRACE steps.'
            : 'This tab is reserved for a later module in the approved development plan.'}
        </p>
      </section>
    </AppShell>
  )
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Switched renderer root from scaffold placeholder to M-APP-SHELL layout.
// END_CHANGE_SUMMARY
