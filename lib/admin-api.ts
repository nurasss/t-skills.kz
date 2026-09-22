import { NextResponse } from "next/server";

import {
  adminErrorResponse,
  adminViewerOrResponse,
  type AdminContext,
  type AdminPermission,
} from "@/lib/admin-rbac";
import { parseJsonBody, type ParsedBody } from "@/lib/request-validation";

export async function adminJsonRoute<T>(
  request: Request,
  permission: AdminPermission,
  handler: (context: AdminContext) => Promise<T>,
  mutation = false,
) {
  const context = await adminViewerOrResponse(request, permission, mutation);
  if (context instanceof NextResponse) return context;
  try {
    return NextResponse.json(await handler(context), {
      headers: { "Cache-Control": mutation ? "no-store" : "private, no-store" },
    });
  } catch (error) {
    return adminErrorResponse(error, request);
  }
}

export async function adminBody<T>(request: Request, schema: Parameters<typeof parseJsonBody>[1]): Promise<ParsedBody<T>> {
  return parseJsonBody(request, schema as never) as Promise<ParsedBody<T>>;
}
