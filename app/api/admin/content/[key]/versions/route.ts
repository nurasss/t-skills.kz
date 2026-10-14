import { NextResponse } from "next/server";

import { getD1 } from "@/db";
import { adminErrorResponse, adminViewerOrResponse } from "@/lib/admin-rbac";

type ContentVersionRow = {
  content_key: string;
  locale: string;
  version: number;
  status: string;
  payload_json: string;
  created_by: string | null;
  created_at: number;
  published_by: string | null;
  published_at: number | null;
};

function parsePayload(raw: unknown): unknown {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * P2.11 — read-only version history for a CMS content key + locale.
 * Lists content_versions rows (version/status/authors/timestamps/payload).
 * Read operations are not audited; guarded by content.read like listContent.
 */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const context = await adminViewerOrResponse(request, "content.read");
  if (context instanceof NextResponse) return context;
  try {
    const { key } = await params;
    const url = new URL(request.url);
    const locale = (url.searchParams.get("locale") ?? "ru").trim() || "ru";
    const rows = await getD1()
      .prepare(
        `SELECT content_key, locale, version, status, payload_json,
                created_by, created_at, published_by, published_at
           FROM content_versions
          WHERE content_key = ? AND locale = ?
          ORDER BY version DESC
          LIMIT 100`,
      )
      .bind(key, locale)
      .all<ContentVersionRow>();
    const data = (rows.results ?? []).map((row) => ({
      contentKey: row.content_key,
      locale: row.locale,
      version: row.version,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      publishedBy: row.published_by,
      publishedAt: row.published_at,
      payload: parsePayload(row.payload_json),
    }));
    return NextResponse.json({ data, key, locale }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminErrorResponse(error, request);
  }
}
