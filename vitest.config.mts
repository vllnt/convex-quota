import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    exclude: ["**/node_modules/**", "dist/**"],
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },
    coverage: {
      provider: "v8",
      include: [
        "src/shared.ts",
        "src/client/index.ts",
        "src/component/mutations.ts",
        "src/component/queries.ts",
        "src/component/validators.ts",
        "src/component/schema.ts",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
