import { adminJsonRoute } from "@/lib/admin-api";
import { listAudit } from "@/lib/admin-store";

export async function GET(request: Request) {
  return adminJsonRoute(request, "audit.read", () => listAudit(request));
}
