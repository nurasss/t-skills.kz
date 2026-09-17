import type { Metadata } from "next";

import { AuthForm } from "./auth-form";

export const metadata: Metadata = {
  title: "Вход и регистрация · T-Skills",
  description: "Безопасный вход в личный кабинет T-Skills и восстановление доступа.",
  alternates: { canonical: "/auth" },
};

export const dynamic = "force-dynamic";

export default function AuthPage() {
  return <AuthForm />;
}
