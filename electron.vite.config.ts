// FILE: electron.vite.config.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Configure electron-vite build entries for Electron main, preload, and React renderer.
//   SCOPE: main/preload/renderer entry paths, Electron CommonJS output, main-process runtime externals, React plugin, and output conventions for Phase-1 scaffold.
//   DEPENDS: package.json, electron/main.ts, electron/preload.ts, src/main.tsx
//   LINKS: PKG-SCAFFOLD, Phase-1, docs/technology.xml
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

const mainRuntimeExternals = ['chokidar', 'node-cron']

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/main.ts'),
        external: mainRuntimeExternals,
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload.ts'),
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname),
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.4.0 - Enabled Tailwind v4 in the renderer so Figma-derived utility classes and theme styles are emitted.
//   LAST_CHANGE: v1.3.0 - Emitted main/preload as .cjs because Electron Node 20 crashes on ESM import('electron').
//   LAST_CHANGE: v1.2.0 - Kept Electron main runtime dependencies external to avoid ESM/CJS bundle startup failures.
//   LAST_CHANGE: v1.1.0 - Kept electron-store external in the Electron main build to avoid ESM/CJS bundle startup failures.
// END_CHANGE_SUMMARY
