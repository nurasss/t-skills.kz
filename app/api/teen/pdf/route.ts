import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { consumeRateLimit } from "@/lib/durable-store";
import { renderTeenPdf, validateTeenReportPayload } from "@/lib/teen-pdf";
import { teenPdfFonts } from "@/lib/teen-pdf-fonts";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  if (process.env.TEEN_BANK_ENABLED !== "1" && process.env.TEEN_BANK_ENABLED !== "true") {
    return NextResponse.json({ error: "TEEN_NOT_ENABLED" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "teen-pdf", limit: 10, windowMs: 10 * 60 * 1000 });
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
