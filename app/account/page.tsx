import { OrbitaApp } from "../orbita-app";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  await requireChatGPTUser("/account");
  return <OrbitaApp initialView="account" />;
}
