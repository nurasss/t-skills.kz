export type PaymentOperationalStatus =
  | "PAYMENT_PENDING"
  | "PAID"
  | "PAYMENT_FAILED"
  | "REFUND_PENDING"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "REFUND_FAILED"
  | "DISPUTED"
  | "DISPUTE_CLOSED";

export type PaymentEventStatus = Exclude<PaymentOperationalStatus, "PAYMENT_PENDING">;

export const PAYMENT_OPERATIONAL_STATUSES: readonly PaymentOperationalStatus[] = [
  "PAYMENT_PENDING",
  "PAID",
  "PAYMENT_FAILED",
  "REFUND_PENDING",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "REFUND_FAILED",
  "DISPUTED",
  "DISPUTE_CLOSED",
];

/**
 * Payment webhooks are an ordered, replayable event stream. A late failure
 * must never downgrade a paid/refunded/disputed order; refund/dispute states
 * remain visible for operator action and do not silently revoke access.
 */
export function nextPaymentStatus(current: PaymentOperationalStatus, incoming: PaymentEventStatus): PaymentOperationalStatus {
  if (incoming === "DISPUTED") return "DISPUTED";
  if (incoming === "REFUNDED") return current === "DISPUTED" ? "DISPUTED" : "REFUNDED";
  if (incoming === "PARTIALLY_REFUNDED") {
    return current === "DISPUTED" || current === "REFUNDED" ? current : "PARTIALLY_REFUNDED";
  }
  if (incoming === "REFUND_PENDING") {
    return current === "REFUNDED" || current === "PARTIALLY_REFUNDED" || current === "DISPUTED"
      ? current
      : "REFUND_PENDING";
  }
  if (incoming === "REFUND_FAILED") {
    return current === "REFUNDED" || current === "PARTIALLY_REFUNDED" || current === "DISPUTED"
      ? current
      : "REFUND_FAILED";
  }
  if (incoming === "DISPUTE_CLOSED") return current === "DISPUTED" ? "DISPUTE_CLOSED" : current;
  if (incoming === "PAYMENT_FAILED" && ["PAID", "REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "REFUND_FAILED", "DISPUTED", "DISPUTE_CLOSED"].includes(current)) return current;
  if (incoming === "PAID" && ["REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "REFUND_FAILED", "DISPUTED", "DISPUTE_CLOSED"].includes(current)) return current;
  return incoming;
}

/**
 * SQL equivalent of nextPaymentStatus for an UPDATE evaluated against the
 * current row value. This keeps concurrent webhook deliveries monotonic.
 */
export function paymentStatusTransitionSqlCase(incoming: PaymentEventStatus) {
  const branches = PAYMENT_OPERATIONAL_STATUSES
    .map((current) => `WHEN '${current}' THEN '${nextPaymentStatus(current, incoming)}'`)
    .join(" ");
  return `CASE status ${branches} ELSE status END`;
}

export function paymentTelemetryEvent(status: PaymentEventStatus) {
  if (status === "REFUNDED") return "payment_refunded" as const;
  if (status === "PARTIALLY_REFUNDED") return "payment_partially_refunded" as const;
  if (status === "DISPUTED") return "payment_disputed" as const;
  if (status === "DISPUTE_CLOSED") return "payment_dispute_closed" as const;
  return status === "PAID" ? "payment_confirmed" as const : null;
}
