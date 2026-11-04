import { register as registerIdempotency } from "@vllnt/convex-idempotency/test";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { register } from "../../src/test";

const modules = import.meta.glob("./**/*.ts");

const daily = {
  kind: "calendar" as const,
  period: "day" as const,
  timeZone: "Europe/Paris",
};

function setup() {
  const t = convexTest(schema, modules);
  register(t);
  // The helper types `t` for the idempotency schema only; registration itself
  // is schema-agnostic, so adapt the host-typed instance.
  registerIdempotency(
    t as unknown as Parameters<typeof registerIdempotency>[0],
  );
  return t;
}

function caller(t: ReturnType<typeof setup>, name: string) {
  const tokenIdentifier = `https://issuer.test|${name}`;
  return {
    tokenIdentifier,
    as: t.withIdentity({
      issuer: "https://issuer.test",
      subject: name,
      tokenIdentifier,
    }),
  };
}

function used(
  t: ReturnType<typeof setup>,
  subjectRef: string,
): Promise<number> {
  return t
    .query(api.example.remaining, {
      subjectRef,
      key: "plays",
      limit: 5,
      window: daily,
    })
    .then((state) => state.used);
}

describe("consume paired with @vllnt/convex-idempotency in one host mutation", () => {
  test("a duplicate requestId replays the stored result and consumes once", async () => {
    const t = setup();
    const alice = caller(t, "alice");
    const first = await alice.as.mutation(api.example.play, {
      requestId: "req-1",
    });
    const replay = await alice.as.mutation(api.example.play, {
      requestId: "req-1",
    });
    expect(first).toMatchObject({ allowed: true, used: 1, remaining: 4 });
    expect(replay).toEqual(first);
    expect(await used(t, alice.tokenIdentifier)).toBe(1);
  });

  test("a different requestId consumes again", async () => {
    const t = setup();
    const alice = caller(t, "alice");
    await alice.as.mutation(api.example.play, { requestId: "req-1" });
    const second = await alice.as.mutation(api.example.play, {
      requestId: "req-2",
    });
    expect(second).toMatchObject({ allowed: true, used: 2, remaining: 3 });
    expect(await used(t, alice.tokenIdentifier)).toBe(2);
  });

  test("the caller scope isolates the same requestId across callers", async () => {
    const t = setup();
    const alice = caller(t, "alice");
    const bob = caller(t, "bob");
    const forAlice = await alice.as.mutation(api.example.play, {
      requestId: "shared",
    });
    const forBob = await bob.as.mutation(api.example.play, {
      requestId: "shared",
    });
    expect(forAlice).toMatchObject({ allowed: true, used: 1 });
    expect(forBob).toMatchObject({ allowed: true, used: 1 });
    expect(await used(t, alice.tokenIdentifier)).toBe(1);
    expect(await used(t, bob.tokenIdentifier)).toBe(1);
  });

  test("a denied consume is recorded and the denial is replayed", async () => {
    const t = setup();
    const alice = caller(t, "alice");
    for (let index = 0; index < 5; index++) {
      await alice.as.mutation(api.example.play, {
        requestId: `fill-${index.toString()}`,
      });
    }
    const denied = await alice.as.mutation(api.example.play, {
      requestId: "over",
    });
    expect(denied).toMatchObject({ allowed: false, used: 5, remaining: 0 });
    // Free a unit: a fresh requestId would now be allowed, the replay must not be.
    await alice.as.mutation(api.example.cancelPlay, {
      requestId: "free-one",
      periodKey: denied.periodKey,
    });
    expect(await used(t, alice.tokenIdentifier)).toBe(4);
    const replay = await alice.as.mutation(api.example.play, {
      requestId: "over",
    });
    expect(replay).toEqual(denied);
    expect(await used(t, alice.tokenIdentifier)).toBe(4);
  });

  test("a host failure after consume rolls back the allowance and the claim", async () => {
    const t = setup();
    const alice = caller(t, "alice");
    await expect(
      alice.as.mutation(api.example.playThenFail, { requestId: "req-1" }),
    ).rejects.toThrow("host failure after consume");
    expect(await used(t, alice.tokenIdentifier)).toBe(0);
    // The claim rolled back too: the retry is a fresh claim, not "inflight".
    const retry = await alice.as.mutation(api.example.play, {
      requestId: "req-1",
    });
    expect(retry).toMatchObject({ allowed: true, used: 1 });
    expect(await used(t, alice.tokenIdentifier)).toBe(1);
  });

  test("a refund event deduplicated by requestId refunds once", async () => {
    const t = setup();
    const alice = caller(t, "alice");
    const first = await alice.as.mutation(api.example.play, {
      requestId: "req-1",
    });
    await alice.as.mutation(api.example.play, { requestId: "req-2" });
    const refund = await alice.as.mutation(api.example.cancelPlay, {
      requestId: "req-1",
      periodKey: first.periodKey,
    });
    expect(refund).toMatchObject({ refunded: true, used: 1 });
    const replay = await alice.as.mutation(api.example.cancelPlay, {
      requestId: "req-1",
      periodKey: first.periodKey,
    });
    expect(replay).toEqual(refund);
    expect(await used(t, alice.tokenIdentifier)).toBe(1);
    await alice.as.mutation(api.example.cancelPlay, {
      requestId: "req-2",
      periodKey: first.periodKey,
    });
    expect(await used(t, alice.tokenIdentifier)).toBe(0);
  });

  test("the host mutation rejects an unauthenticated caller", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.play, { requestId: "req-1" }),
    ).rejects.toThrow("Unauthenticated");
  });
});

describe("idempotency keys are namespaced per operation", () => {
  test("a consume requestId that looks like a refund key does not collide with the refund", async () => {
    const t = setup();
    const alice = caller(t, "alice");
    const played = await alice.as.mutation(api.example.play, {
      requestId: "refund:x",
    });
    const refund = await alice.as.mutation(api.example.cancelPlay, {
      requestId: "x",
      periodKey: played.periodKey,
    });
    expect(refund).toMatchObject({ refunded: true, used: 0 });
    expect(await used(t, alice.tokenIdentifier)).toBe(0);
  });

  test("a refund requestId does not replay into a consume of the same string", async () => {
    const t = setup();
    const alice = caller(t, "alice");
    const refund = await alice.as.mutation(api.example.cancelPlay, {
      requestId: "x",
      periodKey: "unused",
    });
    expect(refund).toMatchObject({ refunded: false });
    const played = await alice.as.mutation(api.example.play, {
      requestId: "refund:x",
    });
    expect(played).toMatchObject({ allowed: true, used: 1 });
    expect(await used(t, alice.tokenIdentifier)).toBe(1);
  });
});
