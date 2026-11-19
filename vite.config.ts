import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base "./" keeps asset and data URLs relative, so the site works at
// https://<user>.github.io/<repo>/ without knowing the repo name.
export default defineConfig({
  base: "./",
  plugins: [react()],
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
