import { NextResponse } from "next/server";

import { getD1 } from "@/db";
import { errorResponse, isResponse, rateLimitResponse, viewerOrResponse } from "@/lib/api-response";
import { isAdmin } from "@/lib/server-auth";
import { getPilotAnalytics } from "@/lib/pilot-analytics";
import { consumeRateLimit } from "@/lib/durable-store";

export async function GET(request: Request) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  if (!isAdmin(viewer)) return NextResponse.json({ error: "ADMIN_REQUIRED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "admin-overview", limit: 30, windowMs: 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const database = getD1();
    const [users, orders, assessments, reports, telemetry, pilotAnalytics] = await Promise.all([
      database.prepare(`SELECT COUNT(*) AS count FROM users WHERE deleted_at IS NULL`).first<{ count: number }>(),
      database.prepare(`SELECT status, COUNT(*) AS count FROM orders GROUP BY status`).all<{ status: string; count: number }>(),
      database.prepare(`SELECT state, COUNT(*) AS count FROM assessments GROUP BY state`).all<{ state: string; count: number }>(),
      database.prepare(`SELECT status, COUNT(*) AS count FROM reports GROUP BY status`).all<{ status: string; count: number }>(),
      database.prepare(`SELECT name, COUNT(*) AS count FROM telemetry_events WHERE occurred_at >= ? GROUP BY name ORDER BY count DESC`).bind(Date.now() - 7 * 24 * 60 * 60 * 1000).all<{ name: string; count: number }>(),
      getPilotAnalytics(database),
    ]);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      users: users?.count ?? 0,
      orders: orders.results ?? [],
      assessments: assessments.results ?? [],
      reports: reports.results ?? [],
      telemetryLast7Days: telemetry.results ?? [],
      pilotAnalytics,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
