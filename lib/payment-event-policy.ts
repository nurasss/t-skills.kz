export type PaymentOperationalStatus =
  | "PAYMENT_PENDING"
  | "PAID"
  | "PAYMENT_FAILED"
  | "REFUNDED"
  | "DISPUTED"
  | "DISPUTE_CLOSED";

export type PaymentEventStatus = Exclude<PaymentOperationalStatus, "PAYMENT_PENDING">;

/**
 * Payment webhooks are an ordered, replayable event stream. A late failure
 * must never downgrade a paid/refunded/disputed order; refund/dispute states
 * remain visible for operator action and do not silently revoke access.
 */
export function nextPaymentStatus(current: PaymentOperationalStatus, incoming: PaymentEventStatus): PaymentOperationalStatus {
  if (incoming === "DISPUTED") return "DISPUTED";
  if (incoming === "REFUNDED") return current === "DISPUTED" ? "DISPUTED" : "REFUNDED";
  if (incoming === "DISPUTE_CLOSED") return current === "DISPUTED" ? "DISPUTE_CLOSED" : current;
  if (incoming === "PAYMENT_FAILED" && ["PAID", "REFUNDED", "DISPUTED", "DISPUTE_CLOSED"].includes(current)) return current;
  if (incoming === "PAID" && ["REFUNDED", "DISPUTED", "DISPUTE_CLOSED"].includes(current)) return current;
  return incoming;
}

export function paymentTelemetryEvent(status: PaymentEventStatus) {
  if (status === "REFUNDED") return "payment_refunded" as const;
  if (status === "DISPUTED") return "payment_disputed" as const;
  if (status === "DISPUTE_CLOSED") return "payment_dispute_closed" as const;
  return status === "PAID" ? "payment_confirmed" as const : null;
}
