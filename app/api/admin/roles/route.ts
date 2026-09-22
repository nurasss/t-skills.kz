import { adminJsonRoute } from "@/lib/admin-api";
import { listRoles } from "@/lib/admin-store";

export async function GET(request: Request) {
  return adminJsonRoute(request, "admins.read", () => listRoles());
}
