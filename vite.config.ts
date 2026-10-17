import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// basicSsl: phones only allow the camera on HTTPS, so serve the LAN dev server with a self-signed cert.
export default defineConfig({ plugins: [react(), basicSsl()], publicDir: "ar/public" });
