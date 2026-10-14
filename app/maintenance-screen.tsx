export function MaintenanceScreen({ locale = "ru", message }: { locale?: "ru" | "kk"; message?: string | null }) {
  const kk = locale === "kk";
  const fallback = kk ? "Қызметті жаңартып жатырмыз. Кейінірек қайтып келіңіз." : "Мы обновляем сервис. Пожалуйста, вернитесь немного позже.";
  const body = message && message.trim() ? message : fallback;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem", background: "#f7f4ee", color: "#173d32" }}>
      <section style={{ maxWidth: 560, textAlign: "center" }}>
        <p style={{ letterSpacing: ".12em", fontSize: ".75rem" }}>T-SKILLS</p>
        <h1>{kk ? "Техникалық қызмет көрсету" : "Техническое обслуживание"}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}
