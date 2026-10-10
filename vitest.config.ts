import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone config: the app's vite.config.ts loads the TanStack Start and Cloudflare plugins,
// which tests of plain server modules do not need.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
