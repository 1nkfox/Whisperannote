// FILE: electron/main.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Electron entry point: browser window, manager initialization, IPC wiring, lifecycle, shutdown.
//   SCOPE: App bootstrap, frameless window creation, secure-token loading, ConfigStore/PyManager/IPC orchestration.
//   DEPENDS: M-IPC, M-PY-MANAGER, M-CONFIG-STORE, M-PRELOAD, M-SHARED, electron
//   LINKS: M-MAIN, V-M-MAIN
//   ROLE: ENTRY_POINT
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   bootstrap - initialize app, load persisted HF token, create window, start backend, register IPC.
// END_MODULE_MAP
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

import { getConfig, getSecretHfToken } from './config-store'
import { registerIpc } from './ipc-handlers'
import { start as startBackend, stop as stopBackend } from './python-manager'

let mainWindow: BrowserWindow | null = null

// START_CONTRACT: createMainWindow
//   PURPOSE: Create a resizable frameless application window with isolation and security preload.
//   INPUTS: none
//   OUTPUTS: BrowserWindow
//   SIDE_EFFECTS: creates native window, loads dev or built renderer
//   LINKS: M-MAIN, V-M-MAIN
// END_CONTRACT: createMainWindow
function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 960,
    minWidth: 1024,
    minHeight: 760,
    resizable: true,
    frame: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.once('ready-to-show', () => window.show())

  // START_BLOCK_LOAD_RENDERER
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  // END_BLOCK_LOAD_RENDERER

  mainWindow = window
  return window
}

// START_CONTRACT: bootstrap
//   PURPOSE: Bootstrap the application: init managers, start backend, register IPC, create window.
//   INPUTS: none
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: registers Electron lifecycle handlers, spawns backend, creates window
//   LINKS: M-MAIN, V-M-MAIN
// END_CONTRACT: bootstrap
export async function bootstrap(): Promise<void> {
  await app.whenReady()

  // START_BLOCK_INIT_MANAGERS
  const config = getConfig()
  const hfToken = getSecretHfToken() ?? undefined

  await startBackend(config.preferredPort ?? undefined, hfToken)
  registerIpc()

  createMainWindow()
  // END_BLOCK_INIT_MANAGERS

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  await stopBackend()
})

void bootstrap().catch((error: unknown) => {
  console.error('[Main][bootstrap][BLOCK_INIT_MANAGERS] failed', error)
  app.quit()
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.5.0 - Changed default frameless window to resizable 1280x960 with practical minimum size.
//   LAST_CHANGE: v1.4.0 - Fixed the frameless app window at 1600x1200 for a monolithic renderer layout.
//   LAST_CHANGE: v1.3.0 - Report bootstrap failures instead of leaving unhandled promise rejections.
//   LAST_CHANGE: v1.2.0 - Updated preload path to the CommonJS build artifact used by Electron runtime.
//   LAST_CHANGE: v1.1.0 - Backend startup now reuses the persisted secure HF token for pyannote/model access.
// END_CHANGE_SUMMARY
