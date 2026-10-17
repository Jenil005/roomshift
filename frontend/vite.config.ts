import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Where /api goes in dev: the deployed backend by default, or a local `deepspace dev`
  // (e.g. API_PROXY_TARGET=http://localhost:5173 in .env.live.local).
  const apiTarget = env.API_PROXY_TARGET || "https://roomshift.app.space";
  // Phones reach the dev server by LAN IP, and browsers only allow the camera on HTTPS
  // (or localhost). DEV_HTTPS=true serves dev over HTTPS with a self-signed certificate.
  const https = env.DEV_HTTPS === "true";
  return {
    plugins: [react(), tailwindcss(), ...(https ? [basicSsl()] : [])],
    resolve: {
      // The shared game contract owned with the backend (same alias as backend/vite.config.ts).
      alias: { "@shared": fileURLToPath(new URL("../shared", import.meta.url)) },
    },
    server: {
      host: true, // reachable from phones on the same network
      allowedHosts: [".trycloudflare.com"], // `cloudflared tunnel` links (trusted HTTPS for phones)
      fs: { allow: [".."] }, // serve ../shared
      proxy: { "/api": { target: apiTarget, changeOrigin: true, secure: true } },
    },
    preview: {
      host: true,
      proxy: { "/api": { target: apiTarget, changeOrigin: true, secure: true } },
    },
  };
});
