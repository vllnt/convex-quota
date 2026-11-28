import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { expect, expectTypeOf, test } from "vitest";
import { register } from "../../src/test";
import schema from "./schema";

/**
 * Guard for `register(t)`: a consuming app passes a `convex-test` instance built
 * from its own schema, which has its own tables and none of the component's.
 * `pnpm typecheck:ci` type-checks this file, so a narrowed signature fails CI.
 */
const modules = import.meta.glob("./**/*.ts");

test("register accepts the example app's schema", () => {
  const t = convexTest(schema, modules);
  register(t);
  register(t, "other");
});

test("register accepts a host schema with unrelated tables", () => {
  const hostSchema = defineSchema({
    todos: defineTable({ text: v.string(), done: v.boolean() }).index("by_done", ["done"]),
  });
  const t = convexTest(hostSchema, modules);
  register(t);
  register(t, "other");
});

test("register rejects values that are not a convex-test instance", () => {
  expectTypeOf<Parameters<typeof register>[0]>().not.toBeAny();
  // @ts-expect-error a string is not a convex-test instance
  expect(() => register("not a convex-test instance")).toThrow(TypeError);
  // @ts-expect-error an object without registerComponent is rejected
  expect(() => register({ query: () => undefined })).toThrow(TypeError);
});
