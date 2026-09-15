import { OrbitaApp } from "../../../orbita-app";
import { requireChatGPTUser } from "../../../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function AssessmentProcessingPage({ params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;
  await requireChatGPTUser(`/assessment/${session}/processing`);
  return <OrbitaApp initialView="processing" initialSessionId={session} />;
}
