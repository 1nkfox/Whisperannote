// FILE: src/App.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Render the temporary Phase-1 scaffold shell until feature views are implemented.
//   SCOPE: Static placeholder UI only; no backend calls, stores, or IPC usage.
//   DEPENDS: React
//   LINKS: PKG-SCAFFOLD, Phase-1
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   App - placeholder renderer component for scaffold verification.
// END_MODULE_MAP
export function App() {
  return (
    <main style={{ minHeight: '100vh', padding: 32, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <section style={{ maxWidth: 720 }}>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>WhisperAnnote</p>
        <h1 style={{ margin: '8px 0 12px', fontSize: 32 }}>Electron + React scaffold</h1>
        <p style={{ margin: 0, color: '#374151', lineHeight: 1.6 }}>
          Phase-1 scaffold is ready. Shared contracts, UI primitives, and i18n are implemented in the
          next GRACE steps.
        </p>
      </section>
    </main>
  )
}
