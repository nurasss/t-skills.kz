import { getRuntimeEnv } from "@/db";
import { attachCheckoutSession, createPendingOrder, markOrderPaymentFailed, handlePaymentEvent } from "@/lib/durable-store";
import type { Viewer } from "@/lib/server-auth";

export class PaymentProviderError extends Error {
  constructor(public readonly code: string, message = code) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

function requiredAmount() {
  const value = Number(getRuntimeEnv().ASSESSMENT_PRICE_MINOR ?? "0");
  if (!Number.isSafeInteger(value) || value <= 0) throw new PaymentProviderError("PAYMENT_PRICE_NOT_CONFIGURED");
  return value;
}

function currency() {
  const value = (getRuntimeEnv().ASSESSMENT_CURRENCY ?? "KZT").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(value)) throw new PaymentProviderError("PAYMENT_CURRENCY_INVALID");
  return value;
}

export async function createCheckout(input: { viewer: Viewer; testId: string; request: Request; idempotencyKey: string }) {
  const runtimeEnv = getRuntimeEnv();
  const provider = (runtimeEnv.PAYMENT_PROVIDER ?? "stripe").toLowerCase();
  if (provider !== "stripe") throw new PaymentProviderError("PAYMENT_PROVIDER_UNSUPPORTED");
  const secret = runtimeEnv.STRIPE_SECRET_KEY;
  if (!secret) throw new PaymentProviderError("STRIPE_SECRET_KEY_MISSING");

  const amountMinor = requiredAmount();
  const orderResult = await createPendingOrder({
    viewer: input.viewer,
    testId: input.testId,
    amountMinor,
    currency: currency(),
    provider: "stripe",
    idempotencyKey: input.idempotencyKey,
  });
  if (orderResult.order.checkoutUrl) return { ...orderResult, checkoutUrl: orderResult.order.checkoutUrl };

  const requestUrl = new URL(input.request.url);
  const baseUrl = runtimeEnv.APP_BASE_URL?.replace(/\/$/, "") ?? requestUrl.origin;
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price_data][currency]", input.testId === "orbita30" ? currency().toLowerCase() : currency().toLowerCase());
  form.set("line_items[0][price_data][unit_amount]", String(amountMinor));
  form.set("line_items[0][price_data][product_data][name]", "ORBITA—30");
  form.set("line_items[0][price_data][product_data][description]", "Развивающий профиль способа действовать");
  form.set("line_items[0][quantity]", "1");
  form.set("client_reference_id", orderResult.order.id);
  form.set("metadata[order_id]", orderResult.order.id);
  form.set("metadata[test_id]", input.testId);
  form.set("success_url", `${baseUrl}/account?payment=success&order_id=${encodeURIComponent(orderResult.order.id)}`);
  form.set("cancel_url", `${baseUrl}/checkout/${encodeURIComponent(input.testId)}?payment=cancelled`);

  let response: Response;
  try {
    response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: form.toString(),
    });
  } catch (error) {
    await markOrderPaymentFailed(orderResult.order.id, "STRIPE_NETWORK_ERROR");
    console.error("stripe_checkout_network_error", error);
    throw new PaymentProviderError("STRIPE_UNAVAILABLE");
  }
  if (!response.ok) {
    await markOrderPaymentFailed(orderResult.order.id, `STRIPE_HTTP_${response.status}`);
    console.error("stripe_checkout_error", { status: response.status });
    throw new PaymentProviderError("STRIPE_CHECKOUT_FAILED");
  }
  const payload = (await response.json()) as { id?: string; url?: string };
  if (!payload.id || !payload.url) {
    await markOrderPaymentFailed(orderResult.order.id, "STRIPE_RESPONSE_INVALID");
    throw new PaymentProviderError("STRIPE_RESPONSE_INVALID");
  }
  await attachCheckoutSession({ viewer: input.viewer, orderId: orderResult.order.id, providerCheckoutId: payload.id, checkoutUrl: payload.url });
  return { ...orderResult, checkoutUrl: payload.url };
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export async function verifyStripeSignature(payload: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const parts = signature.split(",");
  const timestampPart = parts.find((part) => part.startsWith("t="));
  const timestamp = Number(timestampPart?.slice(2));
  if (!Number.isInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = await hmac(secret, `${timestamp}.${payload}`);
  return parts.filter((part) => part.startsWith("v1=")).some((part) => constantTimeEqual(expected, part.slice(3)));
}

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

export async function processStripeWebhook(payload: string, signature: string | null) {
  const secret = getRuntimeEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new PaymentProviderError("STRIPE_WEBHOOK_SECRET_MISSING");
  if (!(await verifyStripeSignature(payload, signature, secret))) throw new PaymentProviderError("STRIPE_SIGNATURE_INVALID");
  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    throw new PaymentProviderError("STRIPE_PAYLOAD_INVALID");
  }
  if (!event.id || !event.type || !event.data?.object) throw new PaymentProviderError("STRIPE_PAYLOAD_INVALID");
  const object = event.data.object;
  const metadata = object.metadata && typeof object.metadata === "object" ? object.metadata as Record<string, unknown> : {};
  const orderId = typeof metadata.order_id === "string" ? metadata.order_id : typeof object.client_reference_id === "string" ? object.client_reference_id : null;
  if (!orderId) return { ignored: true, eventId: event.id, reason: "ORDER_ID_MISSING" };

  let status: "PAID" | "PAYMENT_FAILED" | null = null;
  if ((event.type === "checkout.session.completed" && object.payment_status === "paid") || event.type === "checkout.session.async_payment_succeeded") status = "PAID";
  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") status = "PAYMENT_FAILED";
  if (!status) return { ignored: true, eventId: event.id, reason: "EVENT_NOT_ACTIONABLE" };

  const paymentId = typeof object.payment_intent === "string" ? object.payment_intent : null;
  const result = await handlePaymentEvent({
    providerEventId: event.id,
    eventType: event.type,
    orderId,
    status,
    providerPaymentId: paymentId,
    payloadHash: await sha256(payload),
  });
  return { ignored: false, eventId: event.id, status, ...result };
}
