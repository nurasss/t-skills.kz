import { NextResponse } from "next/server";

import { errorResponse, isResponse, rateLimitResponse, sameOriginOrResponse, viewerOrResponse } from "@/lib/api-response";
import { getOnboardingForUser, consumeRateLimit, saveOnboardingForUser } from "@/lib/durable-store";
import { assessmentOnboardingSchema, parseJsonBody } from "@/lib/request-validation";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const { id } = await params;
  try {
    return NextResponse.json({ onboarding: await getOnboardingForUser(id, viewer) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerOrResponse(request);
  if (isResponse(viewer)) return viewer;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const parsed = await parseJsonBody(request, assessmentOnboardingSchema);
  if (!parsed.ok) return parsed.response;
  const { id } = await params;
  try {
    const rate = await consumeRateLimit({ userId: viewer.userId, scope: "onboarding", limit: 20, windowMs: 15 * 60 * 1000 });
    if (!rate.allowed) return rateLimitResponse(rate.retryAfterSeconds);
    const body = parsed.data;
    const onboarding = await saveOnboardingForUser(id, viewer, {
      age: body.age,
      educationLevel: body.education_level,
      favoriteSubjects: body.favorite_subjects,
      valueRanking: body.value_ranking,
      interests: body.interests,
      hobbies: body.hobbies,
      preferredActivities: body.preferred_activities,
      country: body.country,
      language: body.language,
      plannedEducationPath: body.planned_education_path,
    });
    return NextResponse.json({ onboarding }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
