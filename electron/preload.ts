// FILE: electron/preload.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Expose a type-safe Electron API to the renderer via contextBridge.
//   SCOPE: Whitelisted IPC invoke channels and main-to-renderer event subscriptions.
//   DEPENDS: M-SHARED, electron (contextBridge, ipcRenderer)
//   LINKS: M-PRELOAD, V-M-PRELOAD
//   ROLE: INTEGRATION
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   electronApi - typed invoke/on bridge exposed as window.electron.
// END_MODULE_MAP
import { contextBridge, ipcRenderer } from 'electron'

import type { ElectronApi, IpcChannel, IpcEvent, IpcRequestMap, IpcResponseMap, MainToRendererEventMap } from '../src/shared'

// START_BLOCK_EXPOSE_PLACEHOLDER
const api: ElectronApi = {
  invoke<TChannel extends IpcChannel>(
    channel: TChannel,
    request: IpcRequestMap[TChannel]
  ): Promise<IpcResponseMap[TChannel]> {
    return ipcRenderer.invoke(channel, request)
  },
  on<TEvent extends IpcEvent>(
    event: TEvent,
    listener: (payload: MainToRendererEventMap[TEvent]) => void
  ): () => void {
    const handler = (_event: Electron.IpcRendererEvent, payload: MainToRendererEventMap[TEvent]) => {
      listener(payload)
    }
    ipcRenderer.on(event, handler)
    return () => {
      ipcRenderer.removeListener(event, handler)
    }
  }
}

contextBridge.exposeInMainWorld('electron', api)
// END_BLOCK_EXPOSE_PLACEHOLDER
