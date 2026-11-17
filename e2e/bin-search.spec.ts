import { test, expect, type Page } from "@playwright/test";

async function mock(page: Page) {
  const searches: string[] = [];
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/refresh")) data = { accessToken: "test", user: { id: "admin", name: "Admin", role: "ADMIN" } };
    if (path.endsWith("/credit-sales")) data = {
      settings: { currency: "TRY", enabled: true, unitPrice: "2.50", minCredits: 1, maxCredits: 10000, validityDays: 365, alertsEnabled: true, lowCreditPercent: 20, expiryNoticeDays: 7, alertChannels: ["IN_APP"] },
      channelAvailability: [{ channel: "IN_APP", available: true }],
      plans: [],
    };
    if (path.endsWith("/credit-sales/bin-search")) {
      searches.push(url.searchParams.get("search") ?? "");
      await route.fulfill({ json: { success: true, total: 2, data: [
        { bin: "454671", bankName: "Ziraat Bankası", bankKey: "ziraat", cardAssociation: "VISA", cardType: "CREDIT", cardFamily: "CLASSIC" },
        { bin: "454672", bankName: "Ziraat Bankası", bankKey: "ziraat", cardAssociation: "VISA", cardType: "CREDIT", cardFamily: "CLASSIC" },
      ] } });
      return;
    }
    await route.fulfill({ json: { success: true, data } });
  });
  return searches;
}

test("admin searches BIN records by bank name", async ({ page }) => {
  const searches = await mock(page);
  await page.goto("/admin/credit-sales");
  const input = page.getByLabel("BIN veya banka ara");
  await input.fill("ziraat");
  await expect(page.getByRole("cell", { name: "454671" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Ziraat Bankası" }).first()).toBeVisible();
  await expect(page.getByText("2 kayıt bulundu")).toBeVisible();
  await expect(page.locator(".bin-search-bank img").first()).toBeVisible();
  expect(searches).toContain("ziraat");
});

test("BIN search accepts a numeric prefix", async ({ page }) => {
  await mock(page);
  await page.goto("/admin/credit-sales");
  await page.getByLabel("BIN veya banka ara").fill("4546");
  await expect(page.getByRole("cell", { name: "454671" })).toBeVisible();
});
