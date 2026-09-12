import { expect, test } from "vitest";
import { register } from "../../src/test";

test("registration exposes loadable component modules under a custom mount name", async () => {
  const calls: string[] = [];
  const modules: Record<string, () => Promise<unknown>> = {};
  register({ registerComponent(name, _schema, componentModules) {
    calls.push(name);
    Object.assign(modules, componentModules);
  } }, "secondary");
  expect(calls).toEqual(["secondary"]);
  expect(Object.keys(modules)).toContain("./component/mutations.ts");
  for (const load of Object.values(modules)) expect(await load()).toBeDefined();
});
