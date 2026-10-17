/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Canonical contracts live in ../shared (also used by the backend). Code imported from
    // ../ar and ../backend must use this package's single copy of React and friends, or hooks
    // break with two Reacts and Netlify builds fail when the root has no node_modules.
    alias: { '@shared': fromHere('../shared') },
    dedupe: ['react', 'react-dom'],
  },
  server: { fs: { allow: [fromHere('..')] } },
  // Playwright specs live in e2e/ and run with `npm run test:e2e`.
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
})
