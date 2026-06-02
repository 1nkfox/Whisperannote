// FILE: electron/preload.ts
// VERSION: 0.1.0
// START_MODULE_CONTRACT
//   PURPOSE: Provide a minimal contextBridge preload placeholder for the Phase-1 scaffold.
//   SCOPE: Expose no privileged APIs until M-PRELOAD implements the typed bridge.
//   DEPENDS: electron
//   LINKS: M-PRELOAD, PKG-SCAFFOLD, V-M-PRELOAD
//   ROLE: RUNTIME
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   electronApi - empty placeholder bridge surface for scaffold verification.
// END_MODULE_MAP
import { contextBridge } from 'electron'

export const electronApi = Object.freeze({})

// START_BLOCK_EXPOSE_PLACEHOLDER
contextBridge.exposeInMainWorld('electron', electronApi)
// END_BLOCK_EXPOSE_PLACEHOLDER
