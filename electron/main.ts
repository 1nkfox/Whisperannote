// FILE: electron/main.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Electron entry point: browser window, manager initialization, IPC wiring, lifecycle, shutdown.
//   SCOPE: App bootstrap, frameless window creation, ConfigStore/PyManager/IPC orchestration.
//   DEPENDS: M-IPC, M-PY-MANAGER, M-CONFIG-STORE, M-PRELOAD, M-SHARED, electron
//   LINKS: M-MAIN, V-M-MAIN
//   ROLE: ENTRY_POINT
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   bootstrap - initialize app, create window, start backend, register IPC.
// END_MODULE_MAP
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

import { getConfig } from './config-store'
import { registerIpc } from './ipc-handlers'
import { start as startBackend, stop as stopBackend } from './python-manager'

let mainWindow: BrowserWindow | null = null

// START_CONTRACT: createMainWindow
//   PURPOSE: Create a frameless application window with isolation and security preload.
//   INPUTS: none
//   OUTPUTS: BrowserWindow
//   SIDE_EFFECTS: creates native window, loads dev or built renderer
//   LINKS: M-MAIN, V-M-MAIN
// END_CONTRACT: createMainWindow
function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    frame: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
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
  const hfToken = undefined // Will be read from secure store in Phase-5

  const backendInfo = await startBackend(config.preferredPort ?? undefined, hfToken)
  registerIpc(hfToken)

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

void bootstrap()
