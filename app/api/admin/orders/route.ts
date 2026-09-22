import { adminJsonRoute } from "@/lib/admin-api";
import { listOrders } from "@/lib/admin-store";

export async function GET(request: Request) {
  return adminJsonRoute(request, "orders.read", () => listOrders(request));
}
