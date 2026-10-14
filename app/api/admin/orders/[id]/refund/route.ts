import { NextResponse } from "next/server";

import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";
import { refundOrder } from "@/lib/admin-store";
import { parseJsonBody } from "@/lib/request-validation";
import { z } from "zod";

const refundBodySchema = z.object({
  reason: z.string().trim().max(1000).optional(),
}).strict().optional();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await adminViewerOrResponse(request, "orders.refund", true);
  if (context instanceof NextResponse) return context;
  try {
    const { id } = await params;
    const parsed = await parseJsonBody(request, refundBodySchema);
    if (!parsed.ok) return parsed.response;
    const reason = parsed.data?.reason;
    const result = await refundOrder({
      context,
      request,
      orderId: id,
      reason,
    });
    return NextResponse.json(result);
  } catch (error) {
    return adminErrorResponse(error, request);
  }
}
