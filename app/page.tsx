import type { Metadata } from "next";

import { OrbitaApp } from "./orbita-app";
import { MaintenanceScreen } from "./maintenance-screen";
import { maintenanceModeEnabled } from "@/lib/feature-flags";

export const metadata: Metadata = {
  title: "T-Skills · Профиль ваших сильных сторон",
  description: "Развивающая оценка устойчивых поведенческих предпочтений и сильных сторон.",
  alternates: { canonical: "/" },
};

export default async function Home() {
  if (await maintenanceModeEnabled()) return <MaintenanceScreen />;
  return <OrbitaApp initialView="home" />;
}
