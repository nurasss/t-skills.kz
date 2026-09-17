const OPENAI_ORIGIN = "https://api.openai.com";

/**
 * Resolve the optional OpenAI-compatible endpoint without allowing an API key
 * to be sent to an arbitrary host. The product currently supports the
 * official OpenAI API only; other providers need an explicit security review.
 */
export function resolveOpenAIBaseUrl(value?: string) {
  const raw = value?.trim() || OPENAI_ORIGIN;
  try {
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/, "");
    if (
      url.protocol !== "https:"
      || url.hostname !== "api.openai.com"
      || (url.port && url.port !== "443")
      || url.username
      || url.password
      || url.search
      || url.hash
      || (path !== "" && path !== "/v1")
    ) return null;
    return OPENAI_ORIGIN;
  } catch {
    return null;
  }
}
