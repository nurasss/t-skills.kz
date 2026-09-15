import { expect, test } from "@playwright/test";

test("strict CSP permits hydration and checkout redirect without application script violations", async ({ page }) => {
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
          id: "orbita30",
          name: "ORBITA—30",
          assessmentVersion: "orbita30_ru_v1",
          amountMinor: 150000,
          currency: "KZT",
          availableForCheckout: true,
          includesPdf: true,
          oneTime: true,
          description: "browser fixture",
        },
      }),
    });
  });
  await page.route("**/api/checkout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ checkout_url: "http://127.0.0.1:8790/checkout-redirect-probe" }),
    });
  });
  await page.route("**/checkout-redirect-probe", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Checkout redirect probe</title><h1>Checkout redirect probe</h1>",
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
  await expect(page.getByRole("heading", { name: /Увидеть свой/ })).toBeVisible();

  await page.getByRole("button", { name: /Начать оценку/ }).click();
  await expect(page).toHaveURL(/\/tests\/orbita30$/);
  await page.getByRole("button", { name: /Перейти к оформлению/ }).click();
  await expect(page).toHaveURL(/\/checkout\/orbita30$/);
  await expect(page.getByRole("button", { name: /Перейти к защищённой оплате/ })).toBeEnabled();
  await Promise.all([
    page.waitForURL(/\/checkout-redirect-probe$/),
    page.getByRole("button", { name: /Перейти к защищённой оплате/ }).click(),
  ]);

  expect(pageErrors).toEqual([]);
  expect(violations.filter((item) => item.directive.startsWith("script-src"))).toEqual([]);
});
