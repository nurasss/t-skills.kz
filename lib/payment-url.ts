/** Stripe returns a hosted Checkout URL; never redirect to an arbitrary provider response. */
export function isHostedStripeCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com" && url.pathname.startsWith("/c/pay/") && url.pathname.length > "/c/pay/".length;
  } catch {
    return false;
  }
}
