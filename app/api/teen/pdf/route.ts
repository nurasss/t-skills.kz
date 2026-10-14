import { NextResponse } from "next/server";

import { getRuntimeEnv } from "@/db";
import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit } from "@/lib/durable-store";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { readRequestText, RequestBodyTooLargeError } from "@/lib/request-validation";
import type { Viewer } from "@/lib/server-auth";
import { renderTeenPdf, validateTeenReportPayload } from "@/lib/teen-pdf";
import { teenPdfFonts } from "@/lib/teen-pdf-fonts";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** IP клиента для анонимного rate-limit; proxy headers are opt-in. */
function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 64);
  if (getRuntimeEnv().TRUST_PROXY?.trim().toLowerCase() === "true") {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  }
  return "unknown";
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413, headers: { "Cache-Control": "no-store" } });
  }
  if (!(await isFeatureEnabled("teen_enabled", "TEEN_BANK_ENABLED"))) {
    return NextResponse.json({ error: "TEEN_NOT_ENABLED" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  // FIX1: teen-флоу анонимный — PDF доступен без логина, лимит по IP.
  const viewer = await viewerOrResponse(request);
  const authed = !isResponse(viewer);
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  try {
    const bucketUser = authed ? (viewer as Viewer).userId : `ip:${clientIp(request)}`;
    const rate = await consumeRateLimit({ userId: bucketUser, scope: "teen-pdf", limit: 10, windowMs: 10 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const raw = await readRequestText(request, MAX_BODY_BYTES);
    const bodyValue = JSON.parse(raw) as unknown;
    if (!bodyValue || typeof bodyValue !== "object" || Array.isArray(bodyValue)) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    const body = bodyValue as { report?: unknown; locale?: unknown };
    if (!("report" in body) || (body.locale !== undefined && body.locale !== "ru" && body.locale !== "kk")) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    validateTeenReportPayload(body.report);
    const locale = body.locale ?? "ru";
    const bytes = await renderTeenPdf(body.report, teenPdfFonts(), locale);
    // Buffer.from копирует — ок для ~100KB.
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="t-skills-teen-report.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "INVALID_BODY" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof Error && error.message.startsWith("TEEN_PDF:")) {
      return NextResponse.json({ error: "INVALID_REPORT" }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    return errorResponse(error);
  }
}
