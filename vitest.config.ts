import { defineConfig } from "vitest/config";
// jsx: automatic matches tsconfig ("react-jsx"), so tests can render the scanner components.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { include: ["ar/tests/**/*.test.{ts,js}"] },
});
