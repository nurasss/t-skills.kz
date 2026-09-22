import { adminJsonRoute } from "@/lib/admin-api";
import { listUsers } from "@/lib/admin-store";

export async function GET(request: Request) {
  return adminJsonRoute(request, "users.read", () => listUsers(request));
}
