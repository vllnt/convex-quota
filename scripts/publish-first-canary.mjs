import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** @typedef {{name: string, version: string, private?: boolean, scripts?: Record<string, string>, publishConfig?: Record<string, unknown>}} Manifest */
/** @typedef {(executable: string, arguments_: string[], cwd?: string, capture?: boolean) => string} Run */
/** @typedef {{run?: Run, check?: (name: string) => Promise<void> | void, pack?: (manifest: Manifest, run: Run) => string, manifest?: Manifest, report?: (message: string) => void}} Dependencies */

export const registry = "https://registry.npmjs.org";

/** @param {string[]} arguments_ @param {string} name */
export function options(arguments_, name) {
  if (arguments_.length === 0) return false;
  assert.deepEqual(
    arguments_,
    ["--publish", "--confirm", name],
    `Use no arguments for dry run, or --publish --confirm ${name}`,
  );
  return true;
}

/** @param {Manifest} manifest */
export function canaryManifest(manifest) {
  assert.match(
    manifest.name,
    /^@vllnt\/convex-(?:quota|progression|buckets)$/u,
  );
  assert.match(
    manifest.version,
    /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u,
  );
  assert.notEqual(manifest.private, true, "package.json is marked private");
  return {
    ...manifest,
    publishConfig: { access: "public", registry, tag: "canary" },
    scripts: {},
    version: `${manifest.version}-canary.0`,
  };
}

/** @type {Run} */
function command(executable, arguments_, cwd = process.cwd(), capture = false) {
  return (
    execFileSync(executable, arguments_, {
      cwd,
      encoding: "utf8",
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    })?.trim() ?? ""
  );
}

/** @param {string} name @param {(url: string, init: {signal: AbortSignal}) => Promise<{status: number}>} request */
export async function requireUnpublished(name, request = globalThis.fetch) {
  const response = await request(`${registry}/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(
    response.status,
    404,
    `First-publication check requires registry HTTP 404; got ${String(response.status)}. Existing packages and registry errors are refused.`,
  );
}

/** @param {Manifest} manifest @param {Run} run */
export function stage(manifest, run) {
  const directory = mkdtempSync(join(tmpdir(), "first-canary-"));
  /** @type {{filename: string}[]} */
  const packed = JSON.parse(
    run(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", directory],
      process.cwd(),
      true,
    ),
  );
  assert.equal(packed.length, 1);
  run("tar", ["-xzf", join(directory, packed[0].filename), "-C", directory]);
  const cwd = join(directory, "package");
  writeFileSync(
    join(cwd, "package.json"),
    `${JSON.stringify(manifest, undefined, 2)}\n`,
  );
  /** @type {{filename: string}[]} */
  const result = JSON.parse(
    run(
      "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", directory],
      cwd,
      true,
    ),
  );
  assert.equal(result.length, 1);
  return join(directory, result[0].filename);
}

/** @param {string[]} arguments_ @param {Dependencies} dependencies */
export async function publishFirstCanary(arguments_, dependencies = {}) {
  const run = dependencies.run ?? command;
  const check = dependencies.check ?? requireUnpublished;
  const pack = dependencies.pack ?? stage;
  /** @type {Manifest} */
  const manifest =
    dependencies.manifest ?? JSON.parse(readFileSync("package.json", "utf8"));
  const publish = options(arguments_, manifest.name);
  const staged = canaryManifest(manifest);
  assert.equal(
    run("git", ["status", "--porcelain"], undefined, true),
    "",
    "Commit changes before preparing a release",
  );
  const head = run("git", ["rev-parse", "HEAD"], undefined, true);
  await check(manifest.name);
  run("pnpm", ["install", "--frozen-lockfile"]);
  ["lint", "typecheck:ci", "test:coverage", "build"].forEach((gate) =>
    run("pnpm", [gate]),
  );
  if (manifest.name === "@vllnt/convex-buckets") run("pnpm", ["test:package"]);
  else run(process.execPath, ["scripts/check-pack.mjs"]);
  run("pnpm", ["generate:llms"]);
  assert.equal(
    run("git", ["status", "--porcelain"], undefined, true),
    "",
    "Quality gates changed tracked files; review and commit them",
  );
  assert.equal(
    run("git", ["rev-parse", "HEAD"], undefined, true),
    head,
    "HEAD changed during checks",
  );
  const tarball = pack(staged, run);
  const report =
    dependencies.report ??
    ((message) => {
      process.stdout.write(`${message}\n`);
    });
  report(`Retained canary tarball: ${tarball}`);
  // Dry-run validation always precedes the one possible registry write.
  const publishArguments = [
    "publish",
    tarball,
    "--tag",
    "canary",
    "--access",
    "public",
    "--registry",
    registry,
    `--@vllnt:registry=${registry}`,
    "--ignore-scripts",
  ];
  run("npm", [...publishArguments, "--dry-run"]);
  if (publish) {
    run("npm", ["whoami", "--registry", registry]);
    await check(manifest.name);
    run("npm", [...publishArguments, "--dry-run=false"]);
  }
  return { publish, tarball, version: staged.version };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await publishFirstCanary(process.argv.slice(2));
    process.stdout.write(
      `${result.publish ? "Published" : "Dry run only"}: ${result.version}\nTarball: ${result.tarball}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Publication failed"}\nStopped; do not retry an uncertain publication without checking npm.\n`,
    );
    process.exitCode = 1;
  }
}
