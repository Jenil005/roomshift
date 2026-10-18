/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const deps: Record<string, string> = JSON.parse(readFileSync(fromHere('./package.json'), 'utf8')).dependencies
const runtimes = `XR Engine ${deps['@8thwall/engine-binary']} · MediaPipe ${deps['@mediapipe/tasks-vision']} · COCO-SSD ${deps['@tensorflow-models/coco-ssd']} · three ${deps.three}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Build id and runtime versions for the ?debug overlay (Netlify sets COMMIT_REF).
  define: { __BUILD_SHA__: JSON.stringify((process.env.COMMIT_REF ?? 'local').slice(0, 7)), __RUNTIMES__: JSON.stringify(runtimes) },
  resolve: {
    // Canonical contracts live in ../shared (also used by the backend). Code imported from
    // ../ar and ../backend must use this package's single copy of React and friends, or hooks
    // break with two Reacts and Netlify builds fail when the root has no node_modules.
    alias: { '@shared': fromHere('../shared') },
    dedupe: ['react', 'react-dom', 'three', 'jsqr', '@tensorflow/tfjs-core', '@tensorflow/tfjs-converter', '@tensorflow/tfjs-backend-webgl', '@tensorflow/tfjs-backend-cpu', '@tensorflow-models/coco-ssd', '@mediapipe/tasks-vision'],
  },
  server: {
    allowedHosts: ['.trycloudflare.com'],
    fs: { allow: [fromHere('..')] },
  },
  // Second page: tester diagnostics (detector load/inference timing on the real device).
  build: { rollupOptions: { input: { main: fromHere('index.html'), diagnostics: fromHere('diagnostics.html') } } },
  // Playwright specs live in e2e/ and run with `npm run test:e2e`.
  test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] },
})
