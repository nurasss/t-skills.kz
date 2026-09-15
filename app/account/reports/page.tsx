import { OrbitaApp } from "../../orbita-app";
import { requireChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function AccountReportsPage() {
  await requireChatGPTUser("/account/reports");
  return <OrbitaApp initialView="account" />;
}
