import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit } from "@/lib/durable-store";
import type { Viewer } from "@/lib/server-auth";
import { renderTeenPdf, validateTeenReportPayload } from "@/lib/teen-pdf";
import { teenPdfFonts } from "@/lib/teen-pdf-fonts";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** IP клиента для анонимного rate-limit (доверяем первому адресу в цепочке). */
function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim().slice(0, 64);
  return "unknown";
}

export async function POST(request: Request) {
  if (process.env.TEEN_BANK_ENABLED !== "1" && process.env.TEEN_BANK_ENABLED !== "true") {
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
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    const body = JSON.parse(raw) as { report?: unknown };
    validateTeenReportPayload(body.report);
    const bytes = await renderTeenPdf(body.report, teenPdfFonts());
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
    return errorResponse(error);
  }
}
