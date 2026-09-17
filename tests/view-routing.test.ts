import assert from "node:assert/strict";
import { test } from "node:test";

import { metadataForView, routeForView, viewStateForPath } from "@/lib/view-routing";

test("view routing is pure and preserves assessment phase URLs", () => {
  assert.equal(routeForView("home", { phase: "core" }), "/");
  assert.equal(routeForView("detail", { phase: "core" }), "/tests/t-skills");
  assert.equal(routeForView("checkout", { phase: "core" }), "/checkout/t-skills");
  assert.equal(routeForView("assessment", { sessionId: "sess_1", phase: "core" }), "/assessment/sess_1");
  assert.equal(routeForView("break", { sessionId: "sess_1", phase: "core" }), "/assessment/sess_1/break");
  assert.equal(routeForView("break", { sessionId: "sess_1", phase: "adaptive" }), "/assessment/sess_1/adaptive");
  assert.equal(routeForView("results", { reportId: "rep_1", phase: "adaptive" }), "/results/rep_1");
  assert.equal(routeForView("admin", { phase: "core" }), "/admin");
});

test("browser paths resolve to safe client-shell states", () => {
  assert.deepEqual(viewStateForPath("/tests/t-skills/"), { view: "detail", phase: "core" });
  assert.deepEqual(viewStateForPath("/checkout/t-skills"), { view: "checkout", phase: "core" });
  // Legacy pre-rename slugs keep resolving so old links never break.
  assert.deepEqual(viewStateForPath("/tests/orbita30/"), { view: "detail", phase: "core" });
  assert.deepEqual(viewStateForPath("/checkout/orbita30"), { view: "checkout", phase: "core" });
  assert.deepEqual(viewStateForPath("/assessment/sess_1/adaptive"), { view: "break", phase: "adaptive", sessionId: "sess_1" });
  assert.deepEqual(viewStateForPath("/assessment/sess_1", { orbitaView: "assessment", orbitaPhase: "adaptive" }), {
    view: "assessment",
    phase: "adaptive",
    sessionId: "sess_1",
  });
  assert.deepEqual(viewStateForPath("/account/reports"), { view: "account", phase: "core" });
  assert.equal(viewStateForPath("/assessment/%ZZ"), null);
  assert.equal(viewStateForPath("/not-a-route"), null);
});

test("client-shell metadata stays specific to the active view", () => {
  assert.equal(metadataForView("privacy").title, "Политика конфиденциальности · T-Skills");
  assert.equal(metadataForView("break", "adaptive").title, "Уточняющие вопросы · T-Skills");
  assert.equal(metadataForView("home").title, "T-Skills · Профиль ваших сильных сторон");
  assert.equal(metadataForView("detail").title, "Тест T-Skills");
});
