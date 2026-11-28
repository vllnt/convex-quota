import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import { tsExamples } from "./doc-examples.mjs";
import { extractLinks } from "./markdown-links.mjs";

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
  const links = extractLinks(readFileSync(join(packed, "llms.txt"), "utf8")).map((link) => link.split("#")[0]).filter((link) => link && !/^[a-z][a-z\d+.-]*:/i.test(link));
  const broken = links.filter((link) => { const target = resolve(packed, link); return !link.startsWith("./") || relative(packed, target).startsWith("..") || !existsSync(target) || !statSync(target).isFile(); });
  if (links.length === 0 || broken.length > 0) throw new Error(`llms.txt relative links missing from tarball: ${broken.join(", ") || "none found"}`);
  mkdirSync(join(temporary, "node_modules/@vllnt"), { recursive: true });
  symlinkSync(join(temporary, "package"), join(temporary, "node_modules/@vllnt/convex-quota"));
  for (const dependency of ["convex", "convex-test", "vite", "vitest", "@vllnt/convex-idempotency"]) {
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
  // A strict consumer resolves the shipped TypeScript sources under both resolution modes.
  for (const [module, moduleResolution] of [["ESNext", "Bundler"], ["NodeNext", "NodeNext"]]) {
    run(resolve(root, "node_modules/.bin/tsc"), ["--ignoreConfig", "--noEmit", "--strict", "--exactOptionalPropertyTypes", "--module", module, "--moduleResolution", moduleResolution, "--target", "ES2024", "--skipLibCheck", "check.ts"], temporary);
  }
  // Every runtime entry point loads in plain Node; the types-only and .ts entries are covered by tsc above.
  run(process.execPath, ["--input-type=module", "-e", [
    "import { Quota } from '@vllnt/convex-quota';",
    "if (typeof Quota !== 'function') throw Error('Missing Quota');",
    "for (const entry of ['@vllnt/convex-quota/convex.config', '@vllnt/convex-quota/convex.config.js']) {",
    "  const { default: config } = await import(entry);",
    "  if (typeof config !== 'object' || config === null) throw Error(`${entry} default export is not an object`);",
    "}",
    "import.meta.resolve('@vllnt/convex-quota/package.json');",
  ].join("\n")], temporary);
  const examples = checkDocExamples(packed, temporary);
  console.log(`PASS packed files, llms.txt links, runtime exports, unrelated-host test helper typing and ${examples} doc examples`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

/**
 * Compile every TypeScript block of the packed README.md and docs/API.md as a
 * file of a host app that installed the tarball. `convex/_generated` is a small
 * stub typed from the example modules and the mounts the docs use. Type-shape
 * blocks (`type ConsumeResult = ...`) must match the exported type both ways.
 */
function checkDocExamples(packed, temporary) {
  const docs = ["README.md", "docs/API.md"].map((doc) => ({ doc, text: readFileSync(join(packed, doc), "utf8") }));
  const { files, problems, shapes } = tsExamples(docs);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  const app = join(temporary, "app");
  const write = (path, text) => {
    mkdirSync(dirname(join(app, path)), { recursive: true });
    writeFileSync(join(app, path), text);
  };
  for (const [path, { body }] of files) write(path, `${body}\n`);
  if (!files.has("convex/schema.ts")) write("convex/schema.ts", 'import { defineSchema } from "convex/server";\nexport default defineSchema({});\n');
  /** @type {Map<string, { doc: string, line: number }>} generated file to doc block */
  const origins = new Map([...files].map(([path, { doc, line }]) => [path, { doc, line }]));
  shapes.forEach(({ body, doc, line, names }, index) => {
    const path = `convex/shape_${index}.ts`;
    const checks = names.map((name) => `type Real${name} = import("@vllnt/convex-quota").${name};\nexport const toReal${name} = (value: ${name}): Real${name} => value;\nexport const fromReal${name} = (value: Real${name}): ${name} => value;`);
    write(path, `${body}\n${checks.join("\n")}\n`);
    origins.set(path, { doc, line });
  });
  const modules = [...files.keys()]
    .filter((path) => !/\.test\.tsx?$/.test(path) && !/^convex\/(?:schema|convex\.config(?:\.\d+)?)\.ts$/.test(path))
    .map((path) => path.slice("convex/".length).replace(/\.tsx?$/, ""));
  write("convex/_generated/api.ts", [
    'import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";',
    'import { anyApi, componentsGeneric } from "convex/server";',
    'import type { ComponentApi as IdempotencyApi } from "@vllnt/convex-idempotency/_generated/component";',
    'import type { ComponentApi } from "@vllnt/convex-quota/_generated/component";',
    ...modules.map((module, index) => `import type * as m${index} from "../${module}.js";`),
    `type Modules = { ${modules.map((module, index) => `"${module}": typeof m${index}`).join("; ")} };`,
    'export const api = anyApi as unknown as FilterApi<ApiFromModules<Modules>, FunctionReference<any, "public">>;',
    'export const internal = anyApi as unknown as FilterApi<ApiFromModules<Modules>, FunctionReference<any, "internal">>;',
    "// The mount names the README and docs/API.md examples use.",
    'export const components = componentsGeneric() as unknown as { quota: ComponentApi<"quota">; webQuota: ComponentApi<"webQuota">; mobileQuota: ComponentApi<"mobileQuota">; idempotency: IdempotencyApi<"idempotency"> };',
    "",
  ].join("\n"));
  write("convex/_generated/server.ts", [
    'import type { DataModelFromSchemaDefinition, MutationBuilder, QueryBuilder, ActionBuilder } from "convex/server";',
    'import { actionGeneric, internalActionGeneric, internalMutationGeneric, internalQueryGeneric, mutationGeneric, queryGeneric } from "convex/server";',
    'import type schema from "../schema.js";',
    "type DataModel = DataModelFromSchemaDefinition<typeof schema>;",
    'export const mutation = mutationGeneric as MutationBuilder<DataModel, "public">;',
    'export const internalMutation = internalMutationGeneric as MutationBuilder<DataModel, "internal">;',
    'export const query = queryGeneric as QueryBuilder<DataModel, "public">;',
    'export const internalQuery = internalQueryGeneric as QueryBuilder<DataModel, "internal">;',
    'export const action = actionGeneric as ActionBuilder<DataModel, "public">;',
    'export const internalAction = internalActionGeneric as ActionBuilder<DataModel, "internal">;',
    "",
  ].join("\n"));
  write("tsconfig.json", JSON.stringify({
    compilerOptions: { strict: true, exactOptionalPropertyTypes: true, noEmit: true, target: "ES2022", lib: ["ES2022", "DOM"], module: "ESNext", moduleResolution: "Bundler", types: ["vite/client"], skipLibCheck: true },
    include: ["convex/**/*.ts"],
  }));
  // The app resolves packages from the consumer project one level up.
  try {
    execFileSync(resolve(root, "node_modules/.bin/tsc"), ["--project", join(app, "tsconfig.json")], { cwd: app, encoding: "utf8", stdio: "pipe" });
  } catch (error) {
    // Point each error at the doc line it came from.
    const output = String(error.stdout).replace(/^(convex\/[\w./-]+\.tsx?)\((\d+),(\d+)\)/gm, (raw, path, line, column) => {
      const origin = origins.get(path);
      return origin ? `${origin.doc}:${origin.line + Number(line)}:${column} (${path})` : raw;
    });
    throw new Error(`The TypeScript examples in README.md or docs/API.md do not type-check against the packed package; fix the example (or the exported name it uses) and rerun pnpm check:pack:\n${output}`);
  }
  return files.size + shapes.length;
}
