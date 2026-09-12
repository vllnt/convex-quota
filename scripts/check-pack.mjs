import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), "quota-pack-"));
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: "inherit" });
try {
  run("pnpm", ["build"]);
  run("pnpm", ["pack", "--pack-destination", temporary]);
  const archive = readdirSync(temporary).find((name) => name.endsWith(".tgz"));
  if (!archive) throw new Error("Missing tarball");
  run("tar", ["-xzf", join(temporary, archive), "-C", temporary]);
  mkdirSync(join(temporary, "node_modules/@vllnt"), { recursive: true });
  symlinkSync(join(temporary, "package"), join(temporary, "node_modules/@vllnt/convex-quota"));
  for (const dependency of ["convex", "convex-test", "vite"]) {
    symlinkSync(resolve(root, "node_modules", dependency), join(temporary, "node_modules", dependency));
  }
  writeFileSync(join(temporary, "check.ts"), `/// <reference types="vite/client" />
import { Quota } from '@vllnt/convex-quota';
import component from '@vllnt/convex-quota/convex.config';
import type { ComponentApi } from '@vllnt/convex-quota/_generated/component.js';
import { register } from '@vllnt/convex-quota/test';
import { convexTest } from 'convex-test';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
const host = defineSchema({ unrelated: defineTable({ value: v.string() }) });
register(convexTest(host, {}));
declare const api: ComponentApi;
new Quota(api);
void component;
`);
  run(resolve(root, "node_modules/.bin/tsc"), ["--ignoreConfig", "--noEmit", "--module", "ESNext", "--moduleResolution", "Bundler", "--target", "ES2024", "--skipLibCheck", "check.ts"], temporary);
  run(process.execPath, ["--input-type=module", "-e", "import {Quota} from '@vllnt/convex-quota'; if(typeof Quota !== 'function') throw Error('Missing Quota');"], temporary);
  console.log("PASS packed runtime exports and unrelated-host test helper typing");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
