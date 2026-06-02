// FILE: tailwind.config.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Define Tailwind content roots for the React renderer and tests.
//   SCOPE: Phase-1 scaffold content scanning only; UI tokens are introduced by M-UI.
//   DEPENDS: src/, tests/frontend/
//   LINKS: PKG-SCAFFOLD, M-UI
//   ROLE: CONFIG
//   MAP_MODE: NONE
// END_MODULE_CONTRACT
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', './tests/frontend/**/*.{ts,tsx}'],
  theme: {
    extend: {}
  },
  plugins: []
} satisfies Config
