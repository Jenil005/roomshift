import { defineConfig } from "@playwright/test";

// Browser E2E for the production build against a RUNNING backend (default: local dev server).
//   (cd backend && npx deepspace dev start --port 5199)
//   npm run test:e2e
// ROOMSHIFT_API overrides the backend. Do not aim it at production without approval.
const API = process.env.ROOMSHIFT_API ?? "http://127.0.0.1:5199";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    viewport: { width: 390, height: 844 }, // iPhone 14-sized portrait
    screenshot: "only-on-failure",
  },
  webServer: {
    // Production build (live mode) on a different origin than the API: exercises CORS.
    command: "npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    env: { VITE_GAME_CLIENT: "live", VITE_API_ORIGIN: API },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
