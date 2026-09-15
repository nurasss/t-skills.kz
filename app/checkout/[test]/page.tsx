import { OrbitaApp } from "../../orbita-app";
import { requireChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  await requireChatGPTUser("/checkout/orbita30");
  return <OrbitaApp initialView="checkout" />;
}
