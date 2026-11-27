import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Kept for existing automation; llms.txt is curated, not generated from source.
// Links to files shipped in the npm package stay relative so they match the
// installed version; `pnpm check:pack` verifies they resolve in the tarball.
const index = readFileSync("llms.txt", "utf8");
assert.ok(index.startsWith("# @vllnt/convex-quota\n"));
for (const link of ["[README](./README.md)", "[API Reference](./docs/API.md)", "[Changelog](./CHANGELOG.md)"]) {
  assert.ok(index.includes(link), `llms.txt is missing ${link}`);
}
assert.ok(index.includes("node_modules/@vllnt/convex-quota/"), "llms.txt is missing the coding-agent note");
assert.ok(index.includes("(https://oss.vllnt.com/llms.txt)"), "llms.txt is missing the Ecosystem link");
