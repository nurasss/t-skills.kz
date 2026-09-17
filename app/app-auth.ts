import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { safeReturnTo } from "@/lib/app-auth";
import { isAdmin, viewerFromRequestAsync, type Viewer } from "@/lib/server-auth";

async function requestFromPage() {
  const requestHeaders = await headers();
  return new Request("https://orbita.local", { headers: new Headers(requestHeaders) });
}

async function getAppUser() {
  return viewerFromRequestAsync(await requestFromPage());
}

export async function requireAppUser(returnTo: string): Promise<Viewer> {
  const viewer = await getAppUser();
  if (viewer) return viewer;
  redirect(`/auth?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`);
}

export async function requireAppAdmin(returnTo = "/admin") {
  const viewer = await requireAppUser(returnTo);
  if (!isAdmin(viewer)) notFound();
  return viewer;
}
