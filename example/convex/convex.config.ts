import { defineApp } from "convex/server";
import idempotency from "@vllnt/convex-idempotency/convex.config";
import component from "../../src/component/convex.config";

const app = defineApp();
app.use(component);
app.use(component, { name: "secondary" });
app.use(idempotency);

export default app;
