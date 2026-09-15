export type PdfGrantClaims = {
  reportId: string;
  userId: string;
  expiresAt: number;
};

/** Pure claim validation kept separate so expiry/ownership boundary tests do
 * not need to boot the Cloudflare bindings used by the signing adapter. */
export function validatePdfGrantClaims(value: unknown, nowSeconds = Math.floor(Date.now() / 1000)): PdfGrantClaims | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<PdfGrantClaims>;
  if (
    typeof parsed.reportId !== "string" ||
    parsed.reportId.length === 0 ||
    typeof parsed.userId !== "string" ||
    parsed.userId.length === 0 ||
    typeof parsed.expiresAt !== "number" ||
    !Number.isInteger(parsed.expiresAt) ||
    parsed.expiresAt <= nowSeconds
  ) return null;
  return { reportId: parsed.reportId, userId: parsed.userId, expiresAt: parsed.expiresAt };
}
