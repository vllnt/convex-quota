import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { register } from "../../src/test";
import schema from "./schema";

test("registration exposes loadable component modules under a custom mount name", async () => {
  const t = convexTest(schema, import.meta.glob("./**/*.ts"));
  const calls: string[] = [];
  const modules: Record<string, () => Promise<unknown>> = {};
  const registerComponent: typeof t.registerComponent = (name, componentSchema, componentModules) => {
    calls.push(name);
    Object.assign(modules, componentModules);
    return t.registerComponent(name, componentSchema, componentModules);
  };
  register({ registerComponent }, "secondary");
  expect(calls).toEqual(["secondary"]);
  expect(Object.keys(modules)).toContain("./component/mutations.ts");
  for (const load of Object.values(modules)) expect(await load()).toBeDefined();
});
