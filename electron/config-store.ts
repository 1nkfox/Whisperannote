// FILE: electron/config-store.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Wrap electron-store with safeStorage for HF token management and app config persistence.
//   SCOPE: Read/write AppConfig JSON under Electron userData, encrypted HF-token put/get/clear via safeStorage.
//   DEPENDS: M-SHARED, electron (app, safeStorage), node:fs, node:path
//   LINKS: M-CONFIG-STORE, V-M-CONFIG-STORE
//   ROLE: DATA_LAYER
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   getConfig - returns the current AppConfig from the store.
//   setConfig - merges a partial AppConfig patch and returns the updated config.
//   hasHfToken - returns whether an encrypted HF token exists.
//   getSecretHfToken - decrypts and returns the HF token or null.
//   setSecretHfToken - encrypts and persists the HF token.
//   clearHfToken - removes the encrypted HF token from the store.
//   readStore/writeStore - local JSON persistence helpers.
// END_MODULE_MAP
import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { AppConfig } from '../src/shared'

const HF_TOKEN_KEY = 'hf-token-encrypted'

const defaults: AppConfig = {
  language: 'ru',
  theme: 'system',
  model: 'faster-whisper-large-v3',
  numSpeakers: null,
  outputFolder: '',
  outputFormats: ['json', 'txt', 'srt'],
  watchFolder: null,
  watchEnabled: false,
  cronExpression: '*/5 * * * *',
  preferredPort: null,
  firstRun: true,
  hasHfToken: false
}

type StoreData = AppConfig & {
  [HF_TOKEN_KEY]?: string
}

let store: StoreData | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'config.json')
}

function sanitizeStoreData(value: Partial<StoreData> = {}): StoreData {
  return {
    ...defaults,
    ...value,
    hasHfToken: Boolean(value.hasHfToken),
    [HF_TOKEN_KEY]: value[HF_TOKEN_KEY]
  }
}

function readStore(): StoreData {
  const path = configPath()

  if (!existsSync(path)) {
    return sanitizeStoreData()
  }

  try {
    return sanitizeStoreData(JSON.parse(readFileSync(path, 'utf8')) as Partial<StoreData>)
  } catch {
    return sanitizeStoreData()
  }
}

function writeStore(nextStore: StoreData): void {
  const path = configPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(nextStore, null, 2), 'utf8')
}

function getStore(): StoreData {
  if (!store) {
    store = readStore()
  }
  return store
}

// START_CONTRACT: getConfig
//   PURPOSE: Read the full current AppConfig from the persistent store.
//   INPUTS: none
//   OUTPUTS: AppConfig - current settings
//   SIDE_EFFECTS: initialises the store on first call
//   LINKS: M-CONFIG-STORE, V-M-CONFIG-STORE
// END_CONTRACT: getConfig
export function getConfig(): AppConfig {
  const { [HF_TOKEN_KEY]: _encrypted, ...config } = getStore()
  return config
}

// START_CONTRACT: setConfig
//   PURPOSE: Merge a partial patch into the current config and persist.
//   INPUTS: { patch: Partial<AppConfig> - fields to update }
//   OUTPUTS: AppConfig - the updated full config
//   SIDE_EFFECTS: writes to electron-store
//   LINKS: M-CONFIG-STORE, V-M-CONFIG-STORE
// END_CONTRACT: setConfig
export function setConfig(patch: Partial<AppConfig>): AppConfig {
  const current = { ...getStore() }
  const updated = { ...current, ...patch }
  store = sanitizeStoreData(updated)
  writeStore(store)
  return getConfig()
}

// START_CONTRACT: hasHfToken
//   PURPOSE: Check whether an encrypted HF token exists in the store.
//   INPUTS: none
//   OUTPUTS: boolean - true if encrypted token is present
//   SIDE_EFFECTS: none
//   LINKS: M-CONFIG-STORE, V-M-CONFIG-STORE
// END_CONTRACT: hasHfToken
export function hasHfToken(): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    return false
  }
  try {
    const encrypted = getStore()[HF_TOKEN_KEY]
    return !!encrypted
  } catch {
    return false
  }
}

// START_CONTRACT: getSecretHfToken
//   PURPOSE: Read and decrypt the HF token from the secure store.
//   INPUTS: none
//   OUTPUTS: string | null - plaintext token or null if missing or unavailable
//   SIDE_EFFECTS: none
//   LINKS: M-CONFIG-STORE, V-M-CONFIG-STORE
// END_CONTRACT: getSecretHfToken
export function getSecretHfToken(): string | null {
  // START_BLOCK_READ_SECURE
  if (!safeStorage.isEncryptionAvailable()) {
    return null
  }
  try {
    const encrypted = getStore()[HF_TOKEN_KEY]
    if (!encrypted) return null
    return safeStorage.decryptString(Buffer.from(encrypted, 'hex'))
  } catch {
    return null
  }
  // END_BLOCK_READ_SECURE
}

// START_CONTRACT: setSecretHfToken
//   PURPOSE: Encrypt and persist the HF token using safeStorage.
//   INPUTS: { token: string - plaintext HF token }
//   OUTPUTS: void
//   SIDE_EFFECTS: writes encrypted token to store; updates hasHfToken config flag
//   LINKS: M-CONFIG-STORE, V-M-CONFIG-STORE
// END_CONTRACT: setSecretHfToken
export function setSecretHfToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('ENCRYPTION_UNAVAILABLE')
  }
  const encrypted = safeStorage.encryptString(token)
  store = sanitizeStoreData({ ...getStore(), [HF_TOKEN_KEY]: encrypted.toString('hex'), hasHfToken: true })
  writeStore(store)
}

// START_CONTRACT: clearHfToken
//   PURPOSE: Remove the encrypted HF token from the store.
//   INPUTS: none
//   OUTPUTS: void
//   SIDE_EFFECTS: deletes entry; updates hasHfToken config flag
//   LINKS: M-CONFIG-STORE, V-M-CONFIG-STORE
// END_CONTRACT: clearHfToken
export function clearHfToken(): void {
  const nextStore = { ...getStore(), hasHfToken: false }
  delete nextStore[HF_TOKEN_KEY]
  store = sanitizeStoreData(nextStore)
  writeStore(store)
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Replaced electron-store with local JSON persistence to avoid Electron Node 20 ESM import crash.
// END_CHANGE_SUMMARY
