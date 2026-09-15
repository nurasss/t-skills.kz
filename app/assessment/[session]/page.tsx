import { OrbitaApp } from "../../orbita-app";
import { requireChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function AssessmentPage({ params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  await requireChatGPTUser(`/assessment/${session}`);
  return <OrbitaApp initialView="consent" initialSessionId={session} />;
}
