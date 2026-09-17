import { getRuntimeEnv } from "@/db";

export class EmailDeliveryError extends Error {
  constructor(message = "Email delivery failed") {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
  actionLabel: string;
  actionUrl: string;
}) {
  const env = getRuntimeEnv();
  let actionUrl: URL;
  try {
    actionUrl = new URL(input.actionUrl);
  } catch {
    throw new EmailDeliveryError("Transactional email action URL is invalid.");
  }
  if (!['http:', 'https:'].includes(actionUrl.protocol) || ((env.APP_ENV ?? env.ORBITA_ENV ?? "").toLowerCase().includes("production") && actionUrl.protocol !== "https:")) {
    throw new EmailDeliveryError("Transactional email action URL is invalid.");
  }
  if (actionUrl.searchParams.has("token") || actionUrl.searchParams.has("invite_token")) {
    throw new EmailDeliveryError("One-time email tokens must not be placed in query parameters.");
  }
  const configuredBase = env.APP_BASE_URL?.trim();
  if (configuredBase) {
    try {
      if (actionUrl.origin !== new URL(configuredBase).origin) throw new EmailDeliveryError("Transactional email action URL has an untrusted origin.");
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      throw new EmailDeliveryError("Transactional email action URL has an invalid origin.");
    }
  }
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    if ((env.ORBITA_ENV ?? "").toLowerCase() === "development") return { delivered: false };
    throw new EmailDeliveryError("Transactional email is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to: [input.to],
        reply_to: env.EMAIL_REPLY_TO?.trim() || undefined,
        subject: input.subject,
        text: `${input.text}\n\n${input.actionLabel}: ${actionUrl.toString()}`,
        html: `<p>${escapeHtml(input.text).replaceAll("\n", "<br />")}</p><p><a href="${escapeHtml(actionUrl.toString())}">${escapeHtml(input.actionLabel)}</a></p>`,
      }),
    });
  } catch {
    throw new EmailDeliveryError();
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    await response.text().catch(() => undefined);
    throw new EmailDeliveryError();
  }
  return { delivered: true };
}
