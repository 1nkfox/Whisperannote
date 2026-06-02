// FILE: src/shared/index.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Provide the public barrel for M-SHARED cross-process TypeScript contracts.
//   SCOPE: Re-export IPC contracts and backend DTO mirrors from src/shared.
//   DEPENDS: src/shared/contract.ts, src/shared/dto.ts
//   LINKS: M-SHARED, V-M-SHARED
//   ROLE: BARREL
//   MAP_MODE: SUMMARY
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   contract exports - IPC/AppConfig/BackendInfo/ElectronApi shared surface.
//   dto exports - backend DTO mirrors and WSMessage shared surface.
// END_MODULE_MAP
export * from './contract'
export * from './dto'
