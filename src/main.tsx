// FILE: src/main.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Bootstrap the React renderer into the Electron window.
//   SCOPE: React root creation for the Phase-1 scaffold placeholder app.
//   DEPENDS: React, ReactDOM, src/App.tsx
//   LINKS: PKG-SCAFFOLD, Phase-1
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
import React from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Renderer root element #root was not found')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
