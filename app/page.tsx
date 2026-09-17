import type { Metadata } from "next";

import { OrbitaApp } from "./orbita-app";

export const metadata: Metadata = {
  title: "T-Skills · Профиль ваших сильных сторон",
  description: "Развивающая оценка устойчивых поведенческих предпочтений и сильных сторон.",
  alternates: { canonical: "/" },
};

export default function Home() {
  return <OrbitaApp initialView="home" />;
}
