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
          assessmentVersion: "t-skills-teen-v2",
          amountMinor: 150000,
          currency: "KZT",
          availableForCheckout: true,
          includesPdf: true,
          oneTime: true,
          description: "75 парных сравнений 25 качеств и 8 ситуативных уточнений",
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

  await page.goto("/privacy");
  await expect(page.getByText(/Черновик: реквизиты и юридические условия не утверждены/)).toBeVisible();
  await expect(page.getByText("+7 (727) 310-00-00")).toHaveCount(0);
});

test("published Teen client flow completes the versioned 75+clarification path and validated PDF", async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/teen");
  await expect(page.getByRole("heading", { name: "Что для тебя важно?" })).toBeVisible();
  await page.getByRole("button", { name: /Пропустить/ }).click();
  await expect(page.locator(".ov-teen-topbar strong")).toHaveText("Вопрос 1 из 75");

  for (let index = 0; index < 75; index += 1) {
    await page.getByRole("button", { name: "Одинаково" }).click();
    if (index < 74) await expect(page.locator(".ov-teen-topbar strong")).toHaveText(`Вопрос ${index + 2} из 75`);
  }

  const clarificationOptions = page.locator(".ov-teen-option");
  let clarificationCount = 0;
  while (await clarificationOptions.count() > 0 && clarificationCount < 15) {
    await clarificationOptions.first().click();
    clarificationCount += 1;
  }
  expect(clarificationCount).toBeGreaterThanOrEqual(5);
  expect(clarificationCount).toBeLessThanOrEqual(15);

  await expect(page.locator(".ov-teen-pref-card")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Направления, где твои качества раскрываются сильнее" })).toBeVisible();
  await expect(page.locator(".ov-teen-career-card")).toHaveCount(5);

  const pdfResponse = page.waitForResponse((response) => response.url().endsWith("/api/teen/pdf"));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  expect((await pdfResponse).status()).toBe(200);
  expect((await download).suggestedFilename()).toBe("t-skills-teen-report.pdf");
  expect(pageErrors).toEqual([]);
});
