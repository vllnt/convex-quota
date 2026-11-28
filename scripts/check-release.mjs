import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
for (const [name, script] of Object.entries(manifest.scripts)) {
  assert.doesNotMatch(name, /^(?:alpha|release|prepublishOnly)$/, `Unsafe release script: ${name}`);
  assert.doesNotMatch(script, /npm\s+(?:publish|login|version)|git\s+(?:push|tag)/, `Release bypass: ${name}`);
}
assert.match(manifest.scripts.lint, /(?:^|&& )pnpm check:docs(?: &&|$)/, "pnpm lint must run pnpm check:docs so CI checks the docs");
const workflow = readFileSync(".github/workflows/publish.yml", "utf8");
const stable = workflow.slice(workflow.indexOf("\n  release:"));
assert.ok(stable.length > 100, "Stable job must exist");
const canaryAt = workflow.indexOf("\n  canary:");
assert.ok(canaryAt > 0, "Canary job must exist");
const quality = workflow.slice(0, canaryAt);
// Anchored to a whole step line so a commented-out step does not count.
assert.match(quality, /^ {6}- run: pnpm check:pack$/m, "Publish quality gates must run pnpm check:pack as an uncommented step");
assert.match(stable, /startsWith\(github\.ref, 'refs\/tags\/v'\)/);
assert.match(stable, /git merge-base --is-ancestor/);
assert.match(stable, /--provenance/);
assert.doesNotMatch(stable, /inputs\.bump|npm version|git (?:commit|push)/);
assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN: \$\{\{/);
assert.match(workflow, /cancel-in-progress: false/);
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
assert.match(ci, /^ {6}- run: bash scripts\/test-check-package-contents\.sh$/m, "CI must run scripts/test-check-package-contents.sh as an uncommented step");
const contributing = readFileSync("CONTRIBUTING.md", "utf8");
assert.doesNotMatch(contributing, /pnpm (?:release|alpha)|dispatch.*patch\/minor\/major|RELEASE_ENABLED/);
console.log("PASS tag-driven release contract");
