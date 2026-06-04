// FILE: electron/ipc-handlers.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Register whitelisted IPC handlers for config, dialog, backend, and watcher channels.
//   SCOPE: ipcMain.handle for each IPC_CHANNELS entry; watcher lifecycle bridges new-file events to renderer.
//   INVARIANT: M-PY-MANAGER captures ALLOWED_ROOTS only at spawn (outputFolder/watchFolder). When config:set
//              changes either of those allowed-root inputs, the backend MUST be restarted so path validation
//              (M-FFMPEG.validate_path) sees the new roots; otherwise batch enqueue fails with PATH_NOT_ALLOWED.
//   DEPENDS: M-PY-MANAGER, M-CONFIG-STORE, M-WATCHER, M-SCHEDULER, M-SHARED, electron (dialog, ipcMain, shell)
//   LINKS: M-IPC, V-M-IPC
//   ROLE: INTEGRATION
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   registerIpc - create ipcMain.handle for every whitelisted channel and reload secure tokens for backend restarts.
// END_MODULE_MAP
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'

import type { IpcChannel, IpcRequestMap, IpcResponseMap } from '../src/shared'
import { IPC_CHANNELS } from '../src/shared'
import {
  clearHfToken,
  getConfig,
  getSecretHfToken,
  hasHfToken,
  setConfig,
  setSecretHfToken
} from './config-store'
import { getWatcherStatus, startWatcher, stopWatcher, type NewFileEvent } from './file-watcher'
import { getInfo, getStatus, restart, start, stop } from './python-manager'
import { scheduleScan, stopSchedule } from './scheduler'

// START_CONTRACT: registerIpc
//   PURPOSE: Wire ipcMain.handle for every channel in the IPC_CHANNELS whitelist.
//   INPUTS: none
//   OUTPUTS: void
//   SIDE_EFFECTS: registers ipcMain.handle for all whitelisted channels
//   LINKS: M-IPC, V-M-IPC
// END_CONTRACT: registerIpc
export function registerIpc(): void {
  // START_BLOCK_REGISTER
  for (const channel of IPC_CHANNELS) {
    ipcMain.handle(channel, (event, request: unknown) => handleIpc(event, channel as IpcChannel, request))
  }
  // END_BLOCK_REGISTER
}

async function handleIpc(
  event: Electron.IpcMainInvokeEvent,
  channel: IpcChannel,
  request: unknown
): Promise<unknown> {
  switch (channel) {
    // ---------- Dialog ----------
    case 'dialog:select-file': {
      const filters = (request as IpcRequestMap['dialog:select-file'])?.filters
      const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
      return result.canceled ? null : result.filePaths[0] ?? null
    }

    case 'dialog:select-folder': {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
      return result.canceled ? null : result.filePaths[0] ?? null
    }

    // ---------- Config ----------
    case 'config:get':
      return getConfig()

    // START_CONTRACT: handleConfigSet
    //   PURPOSE: Persist a config patch and keep the backend's ALLOWED_ROOTS in sync with the active roots.
    //   INPUTS: { patch: Partial<AppConfig> - may include outputFolder/watchFolder }
    //   OUTPUTS: { AppConfig - persisted config }
    //   SIDE_EFFECTS: writes config; restarts backend (with current secure HF token) iff outputFolder or
    //                 watchFolder changed, because those define ALLOWED_ROOTS captured at backend spawn.
    //   LINKS: M-CONFIG-STORE, M-PY-MANAGER, M-IPC
    // END_CONTRACT: handleConfigSet
    case 'config:set': {
      return setConfig(request as Partial<IpcRequestMap['config:set']>)
    }

    case 'config:get-hf-token-status':
      return hasHfToken()

    case 'config:set-hf-token': {
      const { token } = request as IpcRequestMap['config:set-hf-token']
      setSecretHfToken(token)
      // Restart backend with new HF token
      void restart(token)
      return { ok: true as const }
    }

    case 'config:clear-hf-token': {
      clearHfToken()
      void restart()
      return { ok: true as const }
    }

    // ---------- Backend ----------
    case 'backend:get-info':
      return getInfo()

    case 'backend:get-status':
      return getStatus()

    case 'backend:restart': {
      await restart(getSecretHfToken() ?? undefined)
      return { ok: true as const }
    }

    // ---------- Watcher ----------
    case 'watcher:start': {
      const { folder, cron } = request as IpcRequestMap['watcher:start']
      const onFile = (payload: NewFileEvent) => event.sender.send('watcher:new-file', payload)
      await startWatcher({
        folder,
        onFile
      })
      if (cron) {
        scheduleScan({ cronExpression: cron, folder, onFile })
      }
      return { ok: true as const }
    }

    case 'watcher:stop':
      stopSchedule()
      await stopWatcher()
      return { ok: true as const }

    case 'watcher:get-status':
      return getWatcherStatus()

    // ---------- Shell ----------
    case 'shell:open-path': {
      const { path } = request as IpcRequestMap['shell:open-path']
      await shell.openPath(path)
      return { ok: true as const }
    }

    // ---------- Window ----------
    case 'window:minimize': {
      BrowserWindow.fromWebContents(event.sender)?.minimize()
      return { ok: true as const }
    }

    case 'window:close': {
      BrowserWindow.fromWebContents(event.sender)?.close()
      return { ok: true as const }
    }

    default:
      throw new Error(`UNKNOWN_CHANNEL: ${channel}`)
  }
}

// START_CHANGE_SUMMARY
//   CONTRACT_PENDING: v1.3.0 - config:set must restart backend when outputFolder/watchFolder change so
//                     ALLOWED_ROOTS stays current; see handleConfigSet contract (coder to implement).
//   LAST_CHANGE: v1.2.0 - Added safe frameless window minimize/close IPC handlers scoped to the sender window.
//   LAST_CHANGE: v1.1.0 - Backend restart now reads the current secure HF token instead of a stale bootstrap argument.
// END_CHANGE_SUMMARY
