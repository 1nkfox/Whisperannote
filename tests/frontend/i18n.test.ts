// FILE: tests/frontend/i18n.test.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-I18N default language, fallback behavior, and language switching.
//   SCOPE: Deterministic i18next instance tests without renderer UI dependencies.
//   DEPENDS: src/i18n, vitest
//   LINKS: M-I18N, V-M-I18N
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   describe(M-I18N) - ru default, en fallback, language switch, and key parity checks.
// END_MODULE_MAP
import { describe, expect, it } from 'vitest'

import { changeLanguage, DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, i18n, resources } from '../../src/i18n'

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') {
    return [prefix]
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key
    return flattenKeys(child, nextPrefix)
  })
}

describe('M-I18N', () => {
  it('uses ru as default and en as fallback', () => {
    expect(DEFAULT_LANGUAGE).toBe('ru')
    expect(FALLBACK_LANGUAGE).toBe('en')
    expect(i18n.language).toBe('ru')
    expect(i18n.t('app.gpuOnly')).toBe('Только GPU (CUDA)')
  })

  it('switches language to en and back to ru', async () => {
    await changeLanguage('en')
    expect(i18n.t('upload.transcribe')).toBe('Transcribe')

    await changeLanguage('ru')
    expect(i18n.t('upload.transcribe')).toBe('Расшифровать')
  })

  it('keeps ru and en translation keys in sync', () => {
    const ruKeys = flattenKeys(resources.ru.translation).sort()
    const enKeys = flattenKeys(resources.en.translation).sort()

    expect(enKeys).toEqual(ruKeys)
    expect(ruKeys).toContain('errors.cudaUnavailable')
  })

  it('falls back to en for missing non-default language keys', async () => {
    await i18n.addResource('en', 'translation', 'fallbackOnly', 'Fallback value')
    await changeLanguage('ru')

    expect(i18n.t('fallbackOnly')).toBe('Fallback value')
  })
})
