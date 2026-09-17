import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { OrbitaApp } from "../../orbita-app";
import { requireAppUser } from "../../app-auth";
import { CHECKOUT_SLUG } from "@/lib/view-routing";

export const metadata: Metadata = { title: "Оформление доступа · T-Skills", description: "Безопасное оформление доступа к оценке T-Skills.", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ test: string }> }) {
  const { test } = await params;
  // Legacy pre-rename slug: permanent redirect, never a broken link.
  if (test === "orbita30") permanentRedirect("/checkout/t-skills");
  if (test !== CHECKOUT_SLUG) notFound();
  await requireAppUser("/checkout/t-skills");
  return <OrbitaApp initialView="checkout" />;
}
