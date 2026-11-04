import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Kept for existing automation; llms.txt is curated, not generated from source.
const index = readFileSync("llms.txt", "utf8");
assert.ok(index.startsWith("# @vllnt/convex-quota\n"));
assert.ok(index.includes("[README](https://github.com/vllnt/convex-quota/blob/main/README.md)"));
assert.ok(index.includes("[API Reference](https://github.com/vllnt/convex-quota/blob/main/docs/API.md)"));
