import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// Phones only allow camera and motion sensors on HTTPS (secure context).
// basicSsl serves the LAN dev server over HTTPS with a self-signed cert.
export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true },
});
