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

type WindowSpec =
  | {
      kind: "calendar";
      period: "day" | "week" | "month";
      timeZone: string;
      weekStartsOn?: "monday" | "sunday";
    }
  | { kind: "rolling"; durationMs: number }
  | { kind: "epoch"; durationMs: number };

type ConsumeResult = {
  allowed: boolean;
  remaining: number;
  used: number;
  limit: number;
  periodKey: string;
  resetsAt: number;
};

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
          window: WindowSpec;
        },
        ConsumeResult,
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
          window: WindowSpec;
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
