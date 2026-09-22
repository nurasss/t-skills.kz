import { getD1, getRuntimeEnv } from "@/db";
import { attachCheckoutSession, createPendingOrder, findOrderIdByPaymentId, markOrderPaymentFailed, handlePaymentEvent } from "@/lib/durable-store";
import type { PaymentEventStatus } from "@/lib/payment-event-policy";
import { T_SKILLS_TEST_ID, T_SKILLS_VERSION_IDS } from "@/lib/t-skills/versions";
import { verifyStripeSignature } from "@/lib/stripe-signature";
import type { Viewer } from "@/lib/server-auth";
import { paymentsEnabled } from "@/lib/runtime-config";
import { paymentsFeatureEnabled } from "@/lib/feature-flags";
import { trustedAppBaseUrl } from "@/lib/app-auth";
import { readBoundedResponseJson, readBoundedResponseText } from "@/lib/provider-contract";
import { isHostedStripeCheckoutUrl } from "@/lib/payment-url";

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

export type PublicTestConfig = {
  id: typeof T_SKILLS_TEST_ID;
  name: string;
  assessmentVersion: string;
  amountMinor: number | null;
  currency: string;
  availableForCheckout: boolean;
  accessMode: "payment" | "beta-free";
  includesPdf: true;
  oneTime: true;
  description: string;
};

export function getPublicTestConfig(): PublicTestConfig {
  const runtimeEnv = getRuntimeEnv();
  const paymentFlowEnabled = paymentsEnabled(runtimeEnv);
  const rawAmount = Number(runtimeEnv.ASSESSMENT_PRICE_MINOR ?? "");
  const amountMinor = Number.isSafeInteger(rawAmount) && rawAmount > 0 ? rawAmount : null;
  const configuredCurrency = (runtimeEnv.ASSESSMENT_CURRENCY ?? "KZT").trim().toUpperCase();
  const validCurrency = /^[A-Z]{3}$/.test(configuredCurrency);
  const provider = (runtimeEnv.PAYMENT_PROVIDER ?? "stripe").trim().toLowerCase();
  return {
    id: T_SKILLS_TEST_ID,
    name: "T-Skills",
    assessmentVersion: T_SKILLS_VERSION_IDS.assessment,
    amountMinor,
    currency: validCurrency ? configuredCurrency : "KZT",
    availableForCheckout: paymentFlowEnabled && amountMinor !== null && validCurrency && provider === "stripe" && Boolean(runtimeEnv.STRIPE_SECRET_KEY?.trim() && runtimeEnv.STRIPE_WEBHOOK_SECRET?.trim() && runtimeEnv.PDF_SIGNING_SECRET?.trim()),
    accessMode: paymentFlowEnabled ? "payment" : "beta-free",
    includesPdf: true,
    oneTime: true,
    description: "67 парных сравнений 25 качеств и 8 коротких карьерных ситуаций",
  };
}

type RegistryPricing = { amountMinor: number; currency: string };

async function registryPricing(testId: string): Promise<RegistryPricing | null> {
  try {
    const row = await getD1().prepare(
      `SELECT amount_minor, currency FROM products WHERE test_id = ? AND status = 'ACTIVE' LIMIT 1`,
    ).bind(testId).first<{ amount_minor: number; currency: string }>();
    const amountMinor = Number(row?.amount_minor);
    const configuredCurrency = String(row?.currency ?? "").trim().toUpperCase();
    if (!row || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !/^[A-Z]{3}$/.test(configuredCurrency)) return null;
    return { amountMinor, currency: configuredCurrency };
  } catch {
    // The environment fallback keeps catalog rendering and local development
    // usable before the additive product/pricing migration is applied.
    return null;
  }
}

export async function getPublicTestConfigAsync(): Promise<PublicTestConfig> {
  const base = getPublicTestConfig();
  const pricing = await registryPricing(T_SKILLS_TEST_ID);
  const runtimeEnv = getRuntimeEnv();
  const provider = (runtimeEnv.PAYMENT_PROVIDER ?? "stripe").trim().toLowerCase();
  const paymentFlowEnabled = await paymentsFeatureEnabled();
  if (!pricing) return { ...base, availableForCheckout: paymentFlowEnabled && base.availableForCheckout, accessMode: paymentFlowEnabled ? "payment" : "beta-free" };
  return {
    ...base,
    amountMinor: pricing.amountMinor,
    currency: pricing.currency,
    availableForCheckout: paymentFlowEnabled && provider === "stripe" && Boolean(
      runtimeEnv.STRIPE_SECRET_KEY?.trim() && runtimeEnv.STRIPE_WEBHOOK_SECRET?.trim() && runtimeEnv.PDF_SIGNING_SECRET?.trim(),
    ),
    accessMode: paymentFlowEnabled ? "payment" : "beta-free",
  };
}

async function currentPricing(testId: string) {
  const pricing = await registryPricing(testId);
  if (pricing) return pricing;
  return { amountMinor: requiredAmount(), currency: currency() };
}

export async function createCheckout(input: { viewer: Viewer; testId: string; request: Request; idempotencyKey: string; promoCode?: string }) {
  const runtimeEnv = getRuntimeEnv();
  if (!await paymentsFeatureEnabled()) throw new PaymentProviderError("PAYMENTS_DISABLED");
  const provider = (runtimeEnv.PAYMENT_PROVIDER ?? "stripe").trim().toLowerCase();
  if (provider !== "stripe") throw new PaymentProviderError("PAYMENT_PROVIDER_UNSUPPORTED");
  const pricing = await currentPricing(input.testId);
  const orderResult = await createPendingOrder({
    viewer: input.viewer,
    testId: input.testId,
    amountMinor: pricing.amountMinor,
    currency: pricing.currency,
    provider: "stripe",
    idempotencyKey: input.idempotencyKey,
    promoCode: input.promoCode,
  });
  if (orderResult.order.freeAccess) return { ...orderResult, checkoutUrl: null };
  const secret = runtimeEnv.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new PaymentProviderError("STRIPE_SECRET_KEY_MISSING");
  if (!runtimeEnv.STRIPE_WEBHOOK_SECRET?.trim()) throw new PaymentProviderError("STRIPE_WEBHOOK_SECRET_MISSING");
  if (!runtimeEnv.PDF_SIGNING_SECRET?.trim()) throw new PaymentProviderError("PDF_SIGNING_SECRET_MISSING");
  if (orderResult.order.checkoutUrl) return { ...orderResult, checkoutUrl: orderResult.order.checkoutUrl };

  const baseUrl = trustedAppBaseUrl(input.request);
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price_data][currency]", pricing.currency.toLowerCase());
  form.set("line_items[0][price_data][unit_amount]", String(orderResult.order.amountMinor));
  form.set("line_items[0][price_data][product_data][name]", "T-Skills");
  form.set("line_items[0][price_data][product_data][description]", "Развивающий профиль способа действовать");
  form.set("line_items[0][quantity]", "1");
  form.set("client_reference_id", orderResult.order.id);
  form.set("metadata[order_id]", orderResult.order.id);
  form.set("metadata[test_id]", input.testId);
  form.set("success_url", `${baseUrl}/thank-you?order_id=${encodeURIComponent(orderResult.order.id)}`);
  form.set("cancel_url", `${baseUrl}/checkout/${encodeURIComponent(input.testId)}?payment=cancelled`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
      },
      signal: controller.signal,
      body: form.toString(),
    });
  } catch {
    await markOrderPaymentFailed(orderResult.order.id, "STRIPE_NETWORK_ERROR");
    console.error("stripe_checkout_network_error", { error_code: "STRIPE_NETWORK_ERROR" });
    throw new PaymentProviderError("STRIPE_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    await markOrderPaymentFailed(orderResult.order.id, `STRIPE_HTTP_${response.status}`);
    await readBoundedResponseText(response, 32 * 1024).catch(() => undefined);
    console.error("stripe_checkout_error", { status: response.status });
    throw new PaymentProviderError("STRIPE_CHECKOUT_FAILED");
  }
  let payload: { id?: string; url?: string };
  try {
    payload = await readBoundedResponseJson(response, 64 * 1024) as { id?: string; url?: string };
  } catch {
    await markOrderPaymentFailed(orderResult.order.id, "STRIPE_RESPONSE_INVALID");
    throw new PaymentProviderError("STRIPE_RESPONSE_INVALID");
  }
  if (!payload.id || !payload.url || !isHostedStripeCheckoutUrl(payload.url)) {
    await markOrderPaymentFailed(orderResult.order.id, "STRIPE_RESPONSE_INVALID");
    console.error("stripe_checkout_url_invalid", { error_code: "STRIPE_RESPONSE_INVALID" });
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

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

export async function processStripeWebhook(payload: string, signature: string | null) {
  const secret = getRuntimeEnv().STRIPE_WEBHOOK_SECRET?.trim();
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
  const paymentId = typeof object.payment_intent === "string" ? object.payment_intent : null;
  const directOrderId = typeof metadata.order_id === "string" ? metadata.order_id : typeof object.client_reference_id === "string" ? object.client_reference_id : null;
  const orderId = directOrderId ?? (paymentId ? await findOrderIdByPaymentId(paymentId) : null);
  if (!orderId) return { ignored: true, eventId: event.id, reason: "ORDER_ID_MISSING" };

  let status: PaymentEventStatus | null = null;
  if ((event.type === "checkout.session.completed" && object.payment_status === "paid") || (event.type === "checkout.session.async_payment_succeeded" && object.payment_status === "paid")) status = "PAID";
  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") status = "PAYMENT_FAILED";
  if (event.type === "charge.refunded" || event.type === "refund.created" || event.type === "refund.updated") status = "REFUNDED";
  if (event.type === "charge.dispute.created") status = "DISPUTED";
  if (event.type === "charge.dispute.closed") status = "DISPUTE_CLOSED";
  if (!status) return { ignored: true, eventId: event.id, reason: "EVENT_NOT_ACTIONABLE" };

  const result = await handlePaymentEvent({
    providerEventId: event.id,
    eventType: event.type,
    orderId,
    status,
    providerPaymentId: paymentId,
    providerCheckoutId: typeof object.id === "string" ? object.id : null,
    amountMinor: typeof object.amount_total === "number" ? object.amount_total : null,
    currency: typeof object.currency === "string" ? object.currency : null,
    testId: typeof metadata.test_id === "string" ? metadata.test_id : null,
    paymentStatus: typeof object.payment_status === "string" ? object.payment_status : null,
    payloadHash: await sha256(payload),
  });
  return { ignored: false, eventId: event.id, status, ...result };
}
