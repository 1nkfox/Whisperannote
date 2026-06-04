// FILE: src/main.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Bootstrap the React renderer into the Electron window.
//   SCOPE: React root creation and renderer global stylesheet import.
//   DEPENDS: React, ReactDOM, src/App.tsx, src/styles/index.css
//   LINKS: PKG-SCAFFOLD, Phase-1, M-UI
//   ROLE: RUNTIME
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
import React from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles/index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Renderer root element #root was not found')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
