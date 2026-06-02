// FILE: electron/main.ts
// VERSION: 0.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Create the minimal secure Electron BrowserWindow for the Phase-1 scaffold.
//   SCOPE: App lifecycle, frameless window creation, dev/prod renderer loading, secure webPreferences.
//   DEPENDS: electron, electron/preload.ts
//   LINKS: M-MAIN, PKG-SCAFFOLD, V-M-MAIN
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   bootstrap - initialize Electron app lifecycle and create the main window.
// END_MODULE_MAP
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

// START_CONTRACT: createMainWindow
//   PURPOSE: Create a frameless renderer window with isolation enabled and no Node integration.
//   INPUTS: none
//   OUTPUTS: BrowserWindow - configured application window
//   SIDE_EFFECTS: creates a native Electron window and loads dev or built renderer URL
//   LINKS: M-MAIN, PKG-SCAFFOLD
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

  return window
}

// START_CONTRACT: bootstrap
//   PURPOSE: Start Electron and create the application window when the app is ready.
//   INPUTS: none
//   OUTPUTS: Promise<void> - resolves after startup handlers are registered
//   SIDE_EFFECTS: registers Electron lifecycle handlers
//   LINKS: M-MAIN, V-M-MAIN
// END_CONTRACT: bootstrap
export async function bootstrap(): Promise<void> {
  // START_BLOCK_INIT_MANAGERS
  await app.whenReady()
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

void bootstrap()
