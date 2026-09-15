import assert from "node:assert/strict";
import { test } from "node:test";

import { routeForView } from "@/lib/view-routing";

test("view routing is pure and preserves assessment phase URLs", () => {
  assert.equal(routeForView("home", { phase: "core" }), "/");
  assert.equal(routeForView("assessment", { sessionId: "sess_1", phase: "core" }), "/assessment/sess_1");
  assert.equal(routeForView("break", { sessionId: "sess_1", phase: "core" }), "/assessment/sess_1/break");
  assert.equal(routeForView("break", { sessionId: "sess_1", phase: "adaptive" }), "/assessment/sess_1/adaptive");
  assert.equal(routeForView("results", { reportId: "rep_1", phase: "adaptive" }), "/results/rep_1");
  assert.equal(routeForView("admin", { phase: "core" }), "/");
});
