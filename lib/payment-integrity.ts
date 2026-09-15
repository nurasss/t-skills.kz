export type PaymentIntegrityOrder = {
  provider: string;
  providerCheckoutId: string | null;
  amountMinor: number;
  currency: string;
  testId: string;
};

export type PaymentIntegrityEvent = {
  providerCheckoutId: string | null;
  amountMinor: number | null;
  currency: string | null;
  testId: string | null;
  paymentStatus: string | null;
};

function normalizedCurrency(value: string | null | undefined) {
  return typeof value === "string" ? value.trim().toUpperCase() : null;
}

/** Exact snapshot match required before a paid entitlement can be created. */
export function validatePaymentSnapshot(order: PaymentIntegrityOrder, event: PaymentIntegrityEvent) {
  return (
    order.provider.trim().toLowerCase() === "stripe" &&
    typeof order.providerCheckoutId === "string" &&
    order.providerCheckoutId.length > 0 &&
    event.providerCheckoutId === order.providerCheckoutId &&
    Number.isSafeInteger(order.amountMinor) &&
    order.amountMinor > 0 &&
    event.amountMinor === order.amountMinor &&
    normalizedCurrency(order.currency) !== null &&
    normalizedCurrency(event.currency) === normalizedCurrency(order.currency) &&
    event.testId === order.testId &&
    event.paymentStatus?.trim().toLowerCase() === "paid"
  );
}
