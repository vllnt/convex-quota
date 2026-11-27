import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), "quota-pack-"));
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: "inherit" });
try {
  run("pnpm", ["build"]);
  run("pnpm", ["pack", "--pack-destination", temporary]);
  const archive = readdirSync(temporary).find((name) => name.endsWith(".tgz"));
  if (!archive) throw new Error("Missing tarball");
  run("tar", ["-xzf", join(temporary, archive), "-C", temporary]);
  const packed = join(temporary, "package");
  // Coding agents read these from node_modules; a missing file must fail CI.
  const required = ["README.md", "LICENSE", "CHANGELOG.md", "llms.txt", "docs/API.md", "dist/client/index.js", "dist/client/index.d.ts", "dist/component/convex.config.js", "src/test.ts"];
  const missing = required.filter((file) => !existsSync(join(packed, file)));
  if (missing.length > 0) throw new Error(`Tarball is missing required files: ${missing.join(", ")}`);
  // Every non-URL llms.txt link must be "./path" to a file inside the tarball.
  const links = [...readFileSync(join(packed, "llms.txt"), "utf8").matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1].split("#")[0]).filter((link) => link && !/^[a-z][a-z\d+.-]*:/i.test(link));
  const broken = links.filter((link) => { const target = resolve(packed, link); return !link.startsWith("./") || relative(packed, target).startsWith("..") || !existsSync(target) || !statSync(target).isFile(); });
  if (links.length === 0 || broken.length > 0) throw new Error(`llms.txt relative links missing from tarball: ${broken.join(", ") || "none found"}`);
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
  writeFileSync(join(temporary, "package.json"), JSON.stringify({ type: "module" }));
  // Consumers resolve the shipped TypeScript sources under both resolution modes.
  for (const [module, moduleResolution] of [["ESNext", "Bundler"], ["NodeNext", "NodeNext"]]) {
    run(resolve(root, "node_modules/.bin/tsc"), ["--ignoreConfig", "--noEmit", "--module", module, "--moduleResolution", moduleResolution, "--target", "ES2024", "--skipLibCheck", "check.ts"], temporary);
  }
  run(process.execPath, ["--input-type=module", "-e", "import {Quota} from '@vllnt/convex-quota'; if(typeof Quota !== 'function') throw Error('Missing Quota');"], temporary);
  console.log("PASS packed files, llms.txt links, runtime exports and unrelated-host test helper typing");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
