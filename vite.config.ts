/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  // Relative base: the app has no URL routes, so it works under any GitHub Pages repo path.
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  test: { include: ['src/**/*.test.ts'] },
})
