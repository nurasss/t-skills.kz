import assert from "node:assert/strict";
import { test } from "node:test";

import { enqueuePending, findPendingItem, pendingForSession, removePending } from "@/lib/response-retry-queue";

const first = { sessionId: "s1", itemId: "Q001", idempotencyKey: "k1", response: 1 };
const second = { sessionId: "s2", itemId: "Q002", idempotencyKey: "k2", response: 2 };

test("retry queue is deterministic, session-scoped, and duplicate-safe without DOM", () => {
  const queue = enqueuePending([], first);
  assert.deepEqual(enqueuePending(queue, first), queue);
  assert.deepEqual(enqueuePending(queue, { ...first, idempotencyKey: "other" }), queue);
  const combined = enqueuePending(queue, second);
  assert.deepEqual(pendingForSession(combined, "s1"), [first]);
  assert.equal(findPendingItem(combined, "s2", "Q002"), second);
  assert.equal(findPendingItem(combined, undefined, "Q999"), undefined);
  assert.deepEqual(removePending(combined, "k1"), [second]);
});
