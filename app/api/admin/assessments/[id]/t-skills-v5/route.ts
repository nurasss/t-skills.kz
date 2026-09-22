import { NextResponse } from "next/server";

import { adminErrorResponse, adminRateLimitResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { consumeRateLimit, getTSkillsV5Diagnostics } from "@/lib/durable-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(_request, "assessment.sensitive.read");
  if (context instanceof NextResponse) return context;
  try {
    const rate = await consumeRateLimit({ userId: context.viewer.userId, scope: "admin-t-skills-v5-diagnostics", limit: 60, windowMs: 60 * 1000 });
    if (!rate.allowed) return adminRateLimitResponse(_request, rate.retryAfterSeconds);
    const { id } = await params;
    return NextResponse.json(await getTSkillsV5Diagnostics(id), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminErrorResponse(error, _request);
  }
}
