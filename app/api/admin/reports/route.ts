import { adminJsonRoute } from "@/lib/admin-api";
import { listReports } from "@/lib/admin-store";

export async function GET(request: Request) {
  return adminJsonRoute(request, "assessment.read", () => listReports(request));
}
