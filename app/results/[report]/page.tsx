import { OrbitaApp } from "../../orbita-app";
import { requireChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function ResultsPage({ params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  await requireChatGPTUser(`/results/${report}`);
  return <OrbitaApp initialView="results" initialReportId={report} />;
}
