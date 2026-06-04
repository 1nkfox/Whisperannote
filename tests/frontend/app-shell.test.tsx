// FILE: tests/frontend/app-shell.test.tsx
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Verify M-APP-SHELL layout rendering and theme switching behavior.
//   SCOPE: jsdom React tests for shell navigation, status badges, and document theme classes.
//   DEPENDS: src/components/layout, src/stores, @testing-library/react
//   LINKS: M-APP-SHELL, V-M-APP-SHELL
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   describe(M-APP-SHELL) - shell layout and dark/light theme contract checks.
// END_MODULE_MAP
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from '../../src/components/layout'
import { resetAllStoresForTests, useBackendStore, useSettingsStore } from '../../src/stores'

describe('M-APP-SHELL contracts', () => {
  beforeEach(() => {
    resetAllStoresForTests()
    document.documentElement.className = ''
  })

  it('renders navigation, title bar, status bar, and child content', () => {
    useBackendStore.getState().setStatus({ running: true, healthy: true, port: 8777 })
    useBackendStore.getState().setHealth({
      status: 'ok',
      python_version: '3.11',
      cuda_available: true,
      cuda_devices: 1,
      whisper_ready: true,
      pyannote_ready: true,
      models_cached: []
    })

    render(
      <AppShell activeTab="transcribe">
        <p>Manual upload view</p>
      </AppShell>
    )

    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy()
    expect(screen.getByTestId('window-controls').closest('header')?.className).toContain('wa-app-drag')
    expect(screen.getByRole('navigation', { name: 'Main navigation' }).className).toContain('wa-app-no-drag')
    expect(screen.queryByText('WhisperAnnote')).toBeNull()
    expect(screen.queryByText('Current section')).toBeNull()
    expect(screen.getByText('Manual upload view')).toBeTruthy()
    expect(screen.getByText('Backend: online')).toBeTruthy()
    expect(screen.getByText('GPU: 1 CUDA')).toBeTruthy()
  })

  it('invokes frameless window controls through the preload bridge', () => {
    const invoke = vi.fn(async () => ({ ok: true }))
    Object.assign(window, { electron: { invoke } })

    render(
      <AppShell activeTab="transcribe">
        <p>Manual upload view</p>
      </AppShell>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Minimize window' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
    expect(invoke).toHaveBeenCalledWith('window:minimize', undefined)
    expect(invoke).toHaveBeenCalledWith('window:close', undefined)
  })

  it('switches dark and light theme without reload', () => {
    const onTabChange = vi.fn()
    render(
      <AppShell activeTab="batch" onTabChange={onTabChange}>
        <p>Batch placeholder</p>
      </AppShell>
    )

    expect(document.documentElement.classList.contains('light')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }))
    expect(useSettingsStore.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Настройки' }))
    expect(onTabChange).toHaveBeenCalledWith('settings')
  })
})

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.3.0 - Updated shell assertions for compact top bar without masthead/current-section bands.
//   LAST_CHANGE: v1.2.0 - Added draggable/no-drag shell chrome assertions.
//   LAST_CHANGE: v1.1.0 - Added frameless window control bridge coverage.
//   LAST_CHANGE: v1.0.0 - Added module-local shell tests for layout and theme switching.
// END_CHANGE_SUMMARY
