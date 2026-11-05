import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    globals: true,
    // No `include` here on purpose. Each project below sets its own, and a root
    // `include` is inherited through `extends: true` and wins — which silently
    // ran the unit suite three times over and made `--project integration`
    // report 119 passing integration tests that did not exist.
    exclude: ["tests/e2e/**", "node_modules/**"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/server/services/**", "src/lib/**"],
      reporter: ["text-summary"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          // Integration tests share one database; running them in parallel would
          // have them truncate each other's fixtures mid-assertion.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["tests/setup.ts", "tests/setup-dom.ts"],
        },
      },
    ],
  },
});
