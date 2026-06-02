// FILE: vitest.config.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Configure Vitest for renderer and Electron-main unit tests.
//   SCOPE: jsdom environment and test discovery under tests/frontend and tests/main.
//   DEPENDS: package.json, tsconfig.json
//   LINKS: PKG-SCAFFOLD, Phase-1, docs/verification-plan.xml
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    passWithNoTests: true
  }
})
