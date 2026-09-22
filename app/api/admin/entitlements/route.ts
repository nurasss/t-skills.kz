import { adminJsonRoute } from "@/lib/admin-api";
import { listEntitlements } from "@/lib/admin-store";

export async function GET(request: Request) {
  return adminJsonRoute(request, "entitlements.read", () => listEntitlements(request));
}
