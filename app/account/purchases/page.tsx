import { OrbitaApp } from "../../orbita-app";
import { requireChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function AccountPurchasesPage() {
  await requireChatGPTUser("/account/purchases");
  return <OrbitaApp initialView="account" />;
}
