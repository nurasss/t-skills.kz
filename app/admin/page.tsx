import type { Metadata } from "next";

import { requireAppAdmin } from "../app-auth";
import { AdminConsole } from "./admin-console";
import { getAdminContext } from "@/lib/admin-rbac";

export const metadata: Metadata = {
  title: "Администрирование · T-Skills",
  description: "Защищённая внутренняя панель T-Skills.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const viewer = await requireAppAdmin();
  const context = await getAdminContext(viewer);
  if (!context) return null;
  return <AdminConsole viewer={{ email: viewer.email, fullName: viewer.fullName, displayName: viewer.displayName }} permissions={[...context.permissions]} />;
}
