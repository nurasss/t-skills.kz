import { adminJsonRoute } from "@/lib/admin-api";
import { getAnalytics } from "@/lib/admin-store";

export async function GET(request: Request) {
  return adminJsonRoute(request, "analytics.read", () => getAnalytics(request));
}
