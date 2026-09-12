import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { test } from "node:test";

import {
  canaryManifest,
  options,
  publishFirstCanary,
  registry,
  requireUnpublished,
  stage,
} from "./publish-first-canary.mjs";

const name = "@vllnt/convex-quota";
const manifest = {
  name,
  publishConfig: { tag: "latest" },
  scripts: { prepublishOnly: "unsafe" },
  version: "0.1.0",
};

/** @param {import('./publish-first-canary.mjs').Dependencies} overrides
 * @returns {{calls: string[][], dependencies: import('./publish-first-canary.mjs').Dependencies}} */
function fixture(overrides = {}) {
  /** @type {string[][]} */
  const calls = [];
  return {
    calls,
    dependencies: {
      check: () => {
        calls.push(["registry-check"]);
      },
      manifest,
      pack: (value) => {
        assert.equal(value.version, "0.1.0-canary.0");
        assert.deepEqual(value.scripts, {});
        assert.deepEqual(value.publishConfig, {
          access: "public",
          registry,
          tag: "canary",
        });
        calls.push(["pack"]);
        return "/tmp/verified-canary.tgz";
      },
      report: (message) => {
        calls.push(["report", message]);
      },
      run: (command, arguments_) => {
        calls.push([command, ...arguments_]);
        if (command === "git")
          return arguments_[0] === "status" ? "" : "commit";
        return "";
      },
      ...overrides,
    },
  };
}

void test("only explicit matching package confirmation permits publication", () => {
  assert.equal(options([], name), false);
  assert.equal(options(["--publish", "--confirm", name], name), true);
  for (const arguments_ of [
    ["--publish"],
    ["--tag", "latest"],
    ["--publish", "--confirm", "other"],
    ["--dry-run", "--publish"],
  ]) {
    assert.throws(() => options(arguments_, name));
  }
  for (const version of ["1.0.0-beta.1", "01.0.0", "latest", "1.0.0;evil"]) {
    assert.throws(() => canaryManifest({ ...manifest, version }));
  }
  assert.throws(() => canaryManifest({ ...manifest, private: true }));
  assert.throws(() =>
    canaryManifest({ ...manifest, name: "@vllnt/convex-helpers" }),
  );
});

void test("default is dry run after all quality and packed-consumer gates", async () => {
  const { calls, dependencies } = fixture();
  const result = await publishFirstCanary([], dependencies);
  assert.equal(result.publish, false);
  const publications = calls.filter(
    ([command, action]) => command === "npm" && action === "publish",
  );
  assert.equal(publications.length, 1);
  assert.ok(publications[0].includes("--dry-run"));
  for (const gate of [
    "lint",
    "typecheck:ci",
    "test:coverage",
    "build",
    "generate:llms",
  ]) {
    assert.ok(
      calls.some(([command, action]) => command === "pnpm" && action === gate),
    );
  }
  assert.ok(calls.some(([, action]) => action === "scripts/check-pack.mjs"));
});

void test("confirmed publication is canary-only, authenticated, checked twice, never tags git", async () => {
  const { calls, dependencies } = fixture();
  await publishFirstCanary(["--publish", "--confirm", name], dependencies);
  assert.equal(
    calls.filter(([action]) => action === "registry-check").length,
    2,
  );
  const publications = calls.filter(
    ([command, action]) => command === "npm" && action === "publish",
  );
  assert.equal(publications.length, 2);
  assert.deepEqual(publications[1], [
    "npm",
    "publish",
    "/tmp/verified-canary.tgz",
    "--tag",
    "canary",
    "--access",
    "public",
    "--registry",
    registry,
    `--@vllnt:registry=${registry}`,
    "--ignore-scripts",
    "--dry-run=false",
  ]);
  assert.ok(
    calls.some(([command, action]) => command === "npm" && action === "whoami"),
  );
  assert.ok(
    !calls.some(
      ([command, action]) =>
        command === "git" && ["push", "tag"].includes(action),
    ),
  );
});

void test("dirty tree, registry failure and failed quality gate prevent staging/publication", async () => {
  for (const overrides of [
    { run: () => "dirty" },
    {
      check: () => {
        throw new Error("Registry unavailable or already exists");
      },
    },
    {
      run: (
        /** @type {string} */ command,
        /** @type {string[]} */ arguments_,
      ) => {
        if (command === "git")
          return arguments_[0] === "status" ? "" : "commit";
        throw new Error("Gate failed");
      },
    },
  ]) {
    const { calls, dependencies } = fixture(overrides);
    await assert.rejects(
      publishFirstCanary(["--publish", "--confirm", name], dependencies),
    );
    assert.ok(!calls.some(([action]) => action === "pack"));
  }
});

void test("registry errors and existing packages fail closed", async () => {
  await requireUnpublished(name, () => Promise.resolve({ status: 404 }));
  for (const status of [200, 401, 403, 429, 500]) {
    await assert.rejects(
      requireUnpublished(name, () => Promise.resolve({ status })),
    );
  }
  await assert.rejects(
    requireUnpublished(name, () => Promise.reject(new Error("timeout"))),
  );
});

void test("real npm pack stages a canary without modifying the source manifest or running hooks", () => {
  const originalCwd = process.cwd();
  const directory = mkdtempSync(join(tmpdir(), "canary-pack-test-"));
  let tarball;
  try {
    process.chdir(directory);
    writeFileSync("package.json", JSON.stringify(manifest));
    writeFileSync("index.js", "export const value = 1;\n");
    const original = readFileSync("package.json", "utf8");
    tarball = stage(canaryManifest(manifest), (command, arguments_, cwd) =>
      execFileSync(command, arguments_, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    );
    /** @type {import('./publish-first-canary.mjs').Manifest} */
    const packed = JSON.parse(
      execFileSync("tar", ["-xOf", tarball, "package/package.json"], {
        encoding: "utf8",
      }),
    );
    assert.equal(packed.version, "0.1.0-canary.0");
    assert.equal(packed.publishConfig.tag, "canary");
    assert.deepEqual(packed.scripts, {});
    assert.equal(readFileSync("package.json", "utf8"), original);
  } finally {
    process.chdir(originalCwd);
    rmSync(directory, { force: true, recursive: true });
    if (tarball) rmSync(dirname(tarball), { force: true, recursive: true });
  }
});

void test("uncertain publish failure reports the retained tarball before the write and never retries", async () => {
  const { calls, dependencies } = fixture();
  const originalRun = dependencies.run;
  assert.ok(originalRun);
  dependencies.run = (command, arguments_, cwd, capture) => {
    if (
      command === "npm" &&
      arguments_[0] === "publish" &&
      arguments_.includes("--dry-run=false")
    ) {
      assert.ok(
        calls.some(
          ([action, message]) =>
            action === "report" && message.includes("/tmp/verified-canary.tgz"),
        ),
      );
      calls.push(["failed-write"]);
      throw new Error("connection lost");
    }
    return originalRun(command, arguments_, cwd, capture);
  };
  await assert.rejects(
    publishFirstCanary(["--publish", "--confirm", name], dependencies),
    /connection lost/u,
  );
  assert.equal(calls.filter(([action]) => action === "failed-write").length, 1);
});

void test("explicit scoped registry overrides conflicting npm config", () => {
  const directory = mkdtempSync(join(tmpdir(), "canary-config-test-"));
  try {
    const config = join(directory, "npmrc");
    writeFileSync(config, "@vllnt:registry=https://invalid.example\n");
    const selected = execFileSync(
      "npm",
      [
        "config",
        "get",
        "@vllnt:registry",
        `--userconfig=${config}`,
        `--@vllnt:registry=${registry}`,
      ],
      { cwd: directory, encoding: "utf8" },
    ).trim();
    assert.equal(selected, registry);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

void test("buckets uses its own packed consumer command", async () => {
  const { calls, dependencies } = fixture({
    manifest: { ...manifest, name: "@vllnt/convex-buckets" },
  });
  await publishFirstCanary([], dependencies);
  assert.ok(
    calls.some(
      ([command, action]) => command === "pnpm" && action === "test:package",
    ),
  );
});
