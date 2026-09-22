import { expect, test } from "@playwright/test";

test("strict CSP permits hydration and protects checkout without application script violations", async ({ page }) => {
  const violations: Array<{ directive: string; blocked: string }> = [];
  const pageErrors: string[] = [];
  await page.exposeFunction("recordCspViolation", (violation: { directive: string; blocked: string }) => {
    violations.push(violation);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      void (window as unknown as { recordCspViolation: (value: { directive: string; blocked: string }) => Promise<void> })
        .recordCspViolation({ directive: event.effectiveDirective, blocked: event.blockedURI });
    });
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/api/catalog", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        supportContact: null,
        test: {
          id: "t-skills",
          name: "T-Skills",
          assessmentVersion: "t-skills_pairwise_v1",
          amountMinor: 150000,
          currency: "KZT",
          availableForCheckout: true,
          includesPdf: true,
          oneTime: true,
          description: "67 парных сравнений 25 качеств и 8 коротких карьерных ситуаций",
        },
      }),
    });
  });
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy"] ?? "";
  const scriptSrc = csp
    .split(";")
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith("script-src ")) ?? "";
  expect(scriptSrc).toMatch(/^script-src 'self' 'nonce-[A-Za-z0-9+/]+={0,2}'$/);
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(scriptSrc).not.toContain("'unsafe-eval'");
  await expect(page.getByRole("heading", { name: /Поймите, в чём вы действительно сильны/ })).toBeVisible();

  await page.getByRole("button", { name: /Пройти T-Skills/ }).first().click();
  await expect(page).toHaveURL(/\/tests\/t-skills$/);
  await page.getByRole("button", { name: /Перейти к оформлению/ }).click();
  await expect(page).toHaveURL(/\/auth\?return_to=%2Fcheckout%2Ft-skills$/);
  await expect(page.getByRole("heading", { name: "С возвращением" })).toBeVisible();

  const missingCsrfStatus = await page.evaluate(async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "attacker@example.invalid", password: "not-a-real-password" }),
    });
    return response.status;
  });
  expect(missingCsrfStatus).toBe(403);

  expect(pageErrors).toEqual([]);
  expect(violations.filter((item) => item.directive.startsWith("script-src"))).toEqual([]);
});
