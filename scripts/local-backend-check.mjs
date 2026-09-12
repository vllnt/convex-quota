// Run only in an isolated anonymous local project. No cloud/admin credentials.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

assert.equal(process.env.CONVEX_AGENT_MODE, "anonymous");
const child = spawn("./node_modules/.bin/convex", ["dev", "--local-cloud-port", "3310", "--local-site-port", "3311", "--typecheck", "enable", "--tail-logs", "disable"], { stdio: ["ignore", "pipe", "pipe"] });
let ready;
const readiness = new Promise((resolve, reject) => {
  ready = resolve;
  child.once("exit", (code) => reject(new Error(`Backend exited before readiness: ${code}`)));
});
for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
  process.stderr.write(chunk);
  if (chunk.toString().includes("Convex functions ready")) ready();
});
const deadline = setTimeout(() => { child.kill("SIGTERM"); process.exitCode = 1; }, 120_000);
try {
  await readiness;
  let inFlight = 0;
  let peakInFlight = 0;
  const client = new ConvexHttpClient("http://127.0.0.1:3310", {
    fetch: async (...parameters) => {
      inFlight++;
      peakInFlight = Math.max(peakInFlight, inFlight);
      try { return await fetch(...parameters); }
      finally { inFlight--; }
    },
  });
  const mutation = (name, args) => client.mutation(makeFunctionReference(`example:${name}`), args, { skipQueue: true });
  const query = (args) => client.query(makeFunctionReference("example:remaining"), args);
  const subjectRef = `local-${Date.now()}`;
  const args = { subjectRef, scope: "audit", key: "occ", limit: 5, window: { kind: "rolling", durationMs: 60_000 } };
  const results = await Promise.all(Array.from({ length: 20 }, () => mutation("consume", args)));
  assert.ok(peakInFlight > 1, `HTTP requests did not overlap: peak=${peakInFlight}`);
  assert.equal(results.filter((r) => r.allowed).length, 5);
  assert.equal(results.filter((r) => !r.allowed).length, 15);
  process.stdout.write(`HTTP peak in-flight requests: ${peakInFlight}\n`);
  assert.equal((await query(args)).used, 5);
  const secondary = await mutation("consumeSecondary", args);
  assert.equal(secondary.used, 1);
  assert.equal((await query(args)).used, 5);
  for (let i = 0; i < 7; i++) await mutation("consume", { ...args, key: `erase-${i}` });
  await mutation("consume", { ...args, scope: "preserved" });
  assert.equal(await mutation("eraseSubject", { subjectRef, scope: "audit", batch: 2 }), 2);
  // Observe actual scheduler progress; a deadline is failure, not proof of success.
  const until = Date.now() + 15_000;
  let remaining;
  do {
    remaining = await query({ ...args, key: "erase-6" });
    if (remaining.used === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < until);
  assert.equal(remaining.used, 0);
  assert.equal((await query(args)).used, 0);
  assert.equal((await query({ ...args, scope: "preserved" })).used, 1);
  process.stdout.write("PASS real local backend: 20 concurrent consumes, exactly 5 allowed; bounded scheduler sweep; scope and second mount isolated\n");
} finally {
  clearTimeout(deadline);
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGINT");
  await exited;
}
