import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
for (const [name, script] of Object.entries(manifest.scripts)) {
  assert.doesNotMatch(name, /^(?:alpha|release|prepublishOnly)$/, `Unsafe release script: ${name}`);
  assert.doesNotMatch(script, /npm\s+(?:publish|login|version)|git\s+(?:push|tag)/, `Release bypass: ${name}`);
}
const workflow = readFileSync(".github/workflows/publish.yml", "utf8");
const stable = workflow.slice(workflow.indexOf("\n  release:"));
assert.ok(stable.length > 100, "Stable job must exist");
assert.match(stable, /startsWith\(github\.ref, 'refs\/tags\/v'\)/);
assert.match(stable, /git merge-base --is-ancestor/);
assert.match(stable, /--provenance/);
assert.doesNotMatch(stable, /inputs\.bump|npm version|git (?:commit|push)/);
assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN: \$\{\{/);
assert.match(workflow, /cancel-in-progress: false/);
const contributing = readFileSync("CONTRIBUTING.md", "utf8");
assert.doesNotMatch(contributing, /pnpm (?:release|alpha)|dispatch.*patch\/minor\/major|RELEASE_ENABLED/);
console.log("PASS tag-driven release contract");
