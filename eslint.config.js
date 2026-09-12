import { base } from "@vllnt/eslint-config";
import convex from "@vllnt/eslint-config/convex";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist/**", "**/_generated/**", "coverage/**"] },
  ...base.map((config) => ({ ...config, files: ["src/**/*.ts"] })),
  ...convex,
  // Apply convex rules to component source (same structure as a convex/ folder)
  {
    files: ["src/component/**/*.ts"],
    ignores: ["src/component/_generated/**"],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "convex-rules/standard-filenames": "error",
      "convex-rules/namespace-separation": "error",
      "convex-rules/snake-case-filenames": "error",
      "convex-rules/no-bare-v-any": "error",
      "convex-rules/require-returns-validator": "error",
      "convex-rules/no-query-in-loop": "error",
      "convex-rules/no-filter-on-query": "error",
    },
  },
  // The integration fixture deliberately exposes both query and mutation wrappers.
  {
    files: ["example/convex/example.ts"],
    rules: {
      "convex-rules/standard-filenames": "off",
      "convex-rules/namespace-separation": "off",
    },
  },
  // Exempt config, validator, and schema files from strict naming rules
  {
    files: [
      "src/component/convex.config.ts",
      "src/component/validators.ts",
      "src/component/schema.ts",
    ],
    rules: {
      "convex-rules/standard-filenames": "off",
      "convex-rules/namespace-separation": "off",
    },
  },
];
