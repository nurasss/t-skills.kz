import { readBoundedResponseJson } from "@/lib/provider-contract";

const MAX_REFUND_LIST_PAGES = 5;
const REFUND_LIST_PAGE_SIZE = 100;
const REFUND_LIST_MAX_BYTES = 512 * 1024;

export type StripeRefundSnapshot = {
  succeededAmount: number;
  latestSucceededId: string | null;
  pending: boolean;
};

export class StripeRefundLookupError extends Error {
  constructor(public readonly reason: "REQUEST_FAILED" | "RESPONSE_INVALID" | "AMOUNT_EXCEEDS_ORDER") {
    super(reason);
    this.name = "StripeRefundLookupError";
  }
}

/** Reads Stripe's refunds for one charge/PaymentIntent before issuing another refund. */
export async function readStripeRefundSnapshot(input: {
  apiKey: string;
  paymentId: string;
  currency: string;
  orderAmount: number;
  fetcher?: typeof fetch;
}): Promise<StripeRefundSnapshot> {
  const fetcher = input.fetcher ?? fetch;
  const filter = input.paymentId.startsWith("ch_") ? "charge" : "payment_intent";
  let startingAfter: string | null = null;
  let succeededAmount = 0;
  let latestSucceededId: string | null = null;

  for (let page = 0; page < MAX_REFUND_LIST_PAGES; page += 1) {
    const url = new URL("https://api.stripe.com/v1/refunds");
    url.searchParams.set(filter, input.paymentId);
    url.searchParams.set("limit", String(REFUND_LIST_PAGE_SIZE));
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetcher(url, {
        headers: { Authorization: `Bearer ${input.apiKey}` },
        signal: controller.signal,
      });
    } catch {
      throw new StripeRefundLookupError("REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new StripeRefundLookupError("REQUEST_FAILED");

    let payload: { data?: unknown; has_more?: unknown };
    try {
      payload = await readBoundedResponseJson(response, REFUND_LIST_MAX_BYTES) as typeof payload;
    } catch {
      throw new StripeRefundLookupError("RESPONSE_INVALID");
    }
    if (!Array.isArray(payload.data) || typeof payload.has_more !== "boolean") {
      throw new StripeRefundLookupError("RESPONSE_INVALID");
    }

    const items = payload.data as Array<Record<string, unknown>>;
    for (const item of items) {
      const status = typeof item.status === "string" ? item.status.toLowerCase() : "";
      const amount = typeof item.amount === "number" ? item.amount : NaN;
      if (
        typeof item.id !== "string" || !item.id.startsWith("re_") ||
        !Number.isSafeInteger(amount) || amount <= 0 ||
        typeof item.currency !== "string" || item.currency.toUpperCase() !== input.currency.trim().toUpperCase() ||
        !["pending", "requires_action", "succeeded", "failed", "canceled"].includes(status)
      ) {
        throw new StripeRefundLookupError("RESPONSE_INVALID");
      }
      if (status === "pending" || status === "requires_action") {
        return { succeededAmount, latestSucceededId, pending: true };
      }
      if (status === "succeeded") {
        succeededAmount += amount;
        latestSucceededId ??= item.id;
        if (succeededAmount > input.orderAmount) throw new StripeRefundLookupError("AMOUNT_EXCEEDS_ORDER");
      }
    }

    if (!payload.has_more) return { succeededAmount, latestSucceededId, pending: false };
    const lastId = items.at(-1)?.id;
    if (typeof lastId !== "string" || page === MAX_REFUND_LIST_PAGES - 1) {
      throw new StripeRefundLookupError("RESPONSE_INVALID");
    }
    startingAfter = lastId;
  }
  throw new StripeRefundLookupError("RESPONSE_INVALID");
}
