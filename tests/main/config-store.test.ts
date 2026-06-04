// FILE: tests/main/config-store.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Test ConfigStore persistence, safeStorage HF-token round-trip, and encryption-unavailable handling.
//   SCOPE: Deterministic mocks of electron safeStorage/app userData and local JSON persistence for vitest.
//   DEPENDS: electron/config-store, vitest
//   LINKS: M-CONFIG-STORE, V-M-CONFIG-STORE
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   describe(M-CONFIG-STORE) - config read/write, token round-trip, encryption not available.
// END_MODULE_MAP
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

const {
  mockEncryptString,
  mockDecryptString,
  mockIsEncryptionAvailable,
  mockExistsSync,
  mockMkdirSync,
  mockReadFileSync,
  mockWriteFileSync,
  resetMock
} = vi.hoisted(() => {
  let fileData: string | null = null

  return {
    mockEncryptString: vi.fn(),
    mockDecryptString: vi.fn(),
    mockIsEncryptionAvailable: vi.fn(),
    mockExistsSync: vi.fn(() => fileData !== null),
    mockMkdirSync: vi.fn(),
    mockReadFileSync: vi.fn(() => fileData ?? '{}'),
    mockWriteFileSync: vi.fn((_path: string, content: string) => {
      fileData = content
    }),
    resetMock() {
      fileData = null
    }
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'H:/userData')
  },
  safeStorage: {
    isEncryptionAvailable: mockIsEncryptionAvailable,
    encryptString: mockEncryptString,
    decryptString: mockDecryptString
  }
}))

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync
}))

import {
  clearHfToken,
  getConfig,
  getSecretHfToken,
  hasHfToken,
  setConfig,
  setSecretHfToken
} from '../../electron/config-store'

describe('M-CONFIG-STORE', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetMock()
  })

  it('returns config with defaults on first call', () => {
    const config = getConfig()
    expect(config.language).toBe('ru')
    expect(config.firstRun).toBe(true)
    expect(config.model).toBe('faster-whisper-large-v3')
    expect(config.hasHfToken).toBe(false)
  })

  it('persists partial config updates', () => {
    const updated = setConfig({ language: 'en', firstRun: false })
    expect(updated.language).toBe('en')
    expect(updated.firstRun).toBe(false)
    expect(updated.model).toBe('faster-whisper-large-v3')

    const reloaded = getConfig()
    expect(reloaded.language).toBe('en')
    expect(reloaded.firstRun).toBe(false)
  })

  it('returns false for hasHfToken when encryption is unavailable', () => {
    mockIsEncryptionAvailable.mockReturnValue(false)
    expect(hasHfToken()).toBe(false)
  })

  it('returns null from getSecretHfToken when encryption is unavailable', () => {
    mockIsEncryptionAvailable.mockReturnValue(false)
    expect(getSecretHfToken()).toBeNull()
  })

  it('encrypts and stores the HF token via setSecretHfToken', () => {
    mockIsEncryptionAvailable.mockReturnValue(true)
    mockEncryptString.mockReturnValue(Buffer.from('encrypted-bytes'))
    mockDecryptString.mockReturnValue('hf-token-value')

    setSecretHfToken('hf-token-value')

    expect(mockEncryptString).toHaveBeenCalledWith('hf-token-value')
    expect(mockWriteFileSync).toHaveBeenCalled()
    expect(getConfig().hasHfToken).toBe(true)
    expect(getSecretHfToken()).toBe('hf-token-value')
  })

  it('clearHfToken removes token and sets hasHfToken to false', () => {
    mockIsEncryptionAvailable.mockReturnValue(true)
    mockEncryptString.mockReturnValue(Buffer.from('encrypted-bytes'))
    mockDecryptString.mockReturnValue('some-token')

    setSecretHfToken('some-token')
    expect(getConfig().hasHfToken).toBe(true)

    clearHfToken()
    expect(getConfig().hasHfToken).toBe(false)
    expect(getSecretHfToken()).toBeNull()
  })

  it('throws ENCRYPTION_UNAVAILABLE when safeStorage is not available', () => {
    mockIsEncryptionAvailable.mockReturnValue(false)
    expect(() => setSecretHfToken('token')).toThrow('ENCRYPTION_UNAVAILABLE')
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.1.0 - Updated tests for local JSON config persistence without electron-store.
// END_CHANGE_SUMMARY
