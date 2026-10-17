import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "ar/public",
  // Generated vendor files can be recopied while the dev server is running.
  server: { watch: { ignored: ["**/ar/public/external/**"] } },
});
