// FILE: electron/ipc-handlers.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Register whitelisted IPC handlers for config, dialog, backend, and watcher channels.
//   SCOPE: ipcMain.handle for each IPC_CHANNELS entry; watcher lifecycle bridges new-file events to renderer.
//   DEPENDS: M-PY-MANAGER, M-CONFIG-STORE, M-WATCHER, M-SCHEDULER, M-SHARED, electron (dialog, ipcMain, shell)
//   LINKS: M-IPC, V-M-IPC
//   ROLE: INTEGRATION
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   registerIpc - create ipcMain.handle for every whitelisted channel.
// END_MODULE_MAP
import { dialog, ipcMain, shell } from 'electron'

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
//   INPUTS: { hfToken?: string - HF token for backend restart after set }
//   OUTPUTS: void
//   SIDE_EFFECTS: registers ipcMain.handle for all whitelisted channels
//   LINKS: M-IPC, V-M-IPC
// END_CONTRACT: registerIpc
export function registerIpc(hfToken?: string): void {
  // START_BLOCK_REGISTER
  for (const channel of IPC_CHANNELS) {
    ipcMain.handle(channel, (event, request: unknown) =>
      handleIpc(event, channel as IpcChannel, request, hfToken)
    )
  }
  // END_BLOCK_REGISTER
}

async function handleIpc(
  event: Electron.IpcMainInvokeEvent,
  channel: IpcChannel,
  request: unknown,
  hfToken?: string
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
      await restart(hfToken)
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

    default:
      throw new Error(`UNKNOWN_CHANNEL: ${channel}`)
  }
}
