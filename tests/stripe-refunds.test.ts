import assert from "node:assert/strict";
import test from "node:test";

import { readStripeRefundSnapshot, StripeRefundLookupError } from "@/lib/stripe-refunds";

function refund(id: string, amount: number, status: string, currency = "kzt") {
  return { id, object: "refund", amount, currency, status };
}

test("Stripe refund lookup paginates and totals only succeeded refunds for the PaymentIntent", async () => {
  const requests: URL[] = [];
  const pages = [
    { data: [refund("re_new", 25_000, "succeeded"), refund("re_failed", 90_000, "failed")], has_more: true },
    { data: [refund("re_old", 15_000, "succeeded")], has_more: false },
  ];
  const snapshot = await readStripeRefundSnapshot({
    apiKey: "sk_test_placeholder",
    paymentId: "pi_order",
    currency: "KZT",
    orderAmount: 150_000,
    fetcher: async (input) => {
      requests.push(new URL(String(input)));
      return new Response(JSON.stringify(pages[requests.length - 1]), { status: 200 });
    },
  });

  assert.deepEqual(snapshot, { succeededAmount: 40_000, latestSucceededId: "re_new", pending: false });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get("payment_intent"), "pi_order");
  assert.equal(requests[0].searchParams.get("limit"), "100");
  assert.equal(requests[1].searchParams.get("starting_after"), "re_failed");
});

test("Stripe refund lookup stops when any refund is still pending", async () => {
  let calls = 0;
  const snapshot = await readStripeRefundSnapshot({
    apiKey: "sk_test_placeholder",
    paymentId: "ch_order",
    currency: "KZT",
    orderAmount: 150_000,
    fetcher: async (input) => {
      calls += 1;
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("charge"), "ch_order");
      return new Response(JSON.stringify({ data: [refund("re_pending", 10_000, "pending")], has_more: true }), { status: 200 });
    },
  });

  assert.deepEqual(snapshot, { succeededAmount: 0, latestSucceededId: null, pending: true });
  assert.equal(calls, 1);
});

test("Stripe refund lookup rejects invalid totals, currencies, and incomplete pagination", async () => {
  await assert.rejects(
    readStripeRefundSnapshot({
      apiKey: "sk_test_placeholder",
      paymentId: "pi_order",
      currency: "KZT",
      orderAmount: 150_000,
      fetcher: async () => new Response(JSON.stringify({ data: [refund("re_1", 151_000, "succeeded")], has_more: false })),
    }),
    (error: unknown) => error instanceof StripeRefundLookupError && error.reason === "AMOUNT_EXCEEDS_ORDER",
  );

  await assert.rejects(
    readStripeRefundSnapshot({
      apiKey: "sk_test_placeholder",
      paymentId: "pi_order",
      currency: "KZT",
      orderAmount: 150_000,
      fetcher: async () => new Response(JSON.stringify({ data: [refund("re_1", 10_000, "succeeded", "usd")], has_more: false })),
    }),
    (error: unknown) => error instanceof StripeRefundLookupError && error.reason === "RESPONSE_INVALID",
  );

  let page = 0;
  await assert.rejects(
    readStripeRefundSnapshot({
      apiKey: "sk_test_placeholder",
      paymentId: "pi_order",
      currency: "KZT",
      orderAmount: 150_000,
      fetcher: async () => {
        page += 1;
        return new Response(JSON.stringify({ data: [refund(`re_${page}`, 1, "failed")], has_more: true }));
      },
    }),
    (error: unknown) => error instanceof StripeRefundLookupError && error.reason === "RESPONSE_INVALID",
  );
  assert.equal(page, 5);
});
