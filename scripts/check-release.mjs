import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
for (const script of Object.values(manifest.scripts)) {
  assert.doesNotMatch(script, /npm\s+(?:publish|login)|git\s+(?:push|tag)/, "No local publication fallback");
}
const workflow = readFileSync(".github/workflows/publish.yml", "utf8");
const stable = workflow.slice(workflow.indexOf("\n  release:"));
assert.ok(stable.length > 100, "Stable job must exist");
assert.match(stable, /github\.ref == 'refs\/heads\/main'/);
assert.match(stable, /vars\.RELEASE_ENABLED == 'true'/);
assert.match(stable, /contents: read/);
assert.doesNotMatch(stable, /contents: write|inputs\.bump|npm version|git (?:commit|push|tag)|gh release|\$\{\{ steps\..*body/);
assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'push' \}\}/);
assert.match(stable, /npm@11 publish --tag latest --provenance --access public --ignore-scripts/);
const contributing = readFileSync("CONTRIBUTING.md", "utf8");
assert.doesNotMatch(contributing, /pnpm (?:release|alpha)|dispatch.*patch\/minor\/major/);
console.log("PASS reviewed-version release contract");
