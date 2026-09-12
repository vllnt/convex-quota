/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    mutations: {
      consume: FunctionReference<
        "mutation",
        "internal",
        {
          amount: number;
          key: string;
          limit: number;
          scope: string;
          subjectRef: string;
          window:
            | {
                kind: "calendar";
                period: "day" | "week" | "month";
                timeZone: string;
                weekStartsOn?: "monday" | "sunday";
              }
            | { durationMs: number; kind: "rolling" }
            | { durationMs: number; kind: "epoch" };
        },
        | {
            allowed: true;
            limit: number;
            periodKey: string;
            remaining: number;
            resetsAt: number;
            used: number;
          }
        | {
            allowed: false;
            limit: number;
            periodKey: string;
            remaining: number;
            resetsAt: number;
            used: number;
          },
        Name
      >;
      eraseSubject: FunctionReference<
        "mutation",
        "internal",
        { batch?: number; scope: string; subjectRef: string },
        number,
        Name
      >;
      refund: FunctionReference<
        "mutation",
        "internal",
        {
          amount: number;
          key: string;
          periodKey: string;
          scope: string;
          subjectRef: string;
        },
        { refunded: boolean; remaining: number; used: number },
        Name
      >;
    };
    queries: {
      remaining: FunctionReference<
        "query",
        "internal",
        {
          key: string;
          limit: number;
          scope: string;
          subjectRef: string;
          window:
            | {
                kind: "calendar";
                period: "day" | "week" | "month";
                timeZone: string;
                weekStartsOn?: "monday" | "sunday";
              }
            | { durationMs: number; kind: "rolling" }
            | { durationMs: number; kind: "epoch" };
        },
        {
          limit: number;
          periodKey: string;
          remaining: number;
          resetsAt: number;
          used: number;
        },
        Name
      >;
    };
  };
