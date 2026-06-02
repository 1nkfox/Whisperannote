// FILE: electron.vite.config.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Configure electron-vite build entries for Electron main, preload, and React renderer.
//   SCOPE: main/preload/renderer entry paths, React plugin, and output conventions for Phase-1 scaffold.
//   DEPENDS: package.json, electron/main.ts, electron/preload.ts, src/main.tsx
//   LINKS: PKG-SCAFFOLD, Phase-1, docs/technology.xml
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/main.ts')
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload.ts')
      }
    }
  },
  renderer: {
    root: resolve(__dirname),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})
