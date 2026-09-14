import { NextResponse } from "next/server";

import { getReport } from "@/lib/api-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getReport(id);
  if (!report) return NextResponse.json({ error: "REPORT_NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ status: "storage_not_configured_in_preview", report_id: id, signed_url: null, note: "Use the browser print flow in preview; production uses a short-lived signed object URL." }, { status: 200 });
}
