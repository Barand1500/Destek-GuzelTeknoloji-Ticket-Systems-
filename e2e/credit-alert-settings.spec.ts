import { test, expect, type Page } from "@playwright/test";

async function mockSettings(page: Page) {
  let settings: Record<string, unknown> = {
    currency: "TRY", enabled: true, unitPrice: "2.50", minCredits: 1,
    maxCredits: 10000, validityDays: 365, alertsEnabled: true,
    lowCreditPercent: 20, expiryNoticeDays: 7,
  };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/refresh")) data = { accessToken: "test", user: { id: "admin", name: "Admin", role: "ADMIN" } };
    if (path.endsWith("/credit-sales")) data = { settings, plans: [], channelAvailability: [
      { channel: "IN_APP", available: true }, { channel: "EMAIL", available: false },
      { channel: "SMS", available: false }, { channel: "WHATSAPP", available: false },
    ] };
    if (path.endsWith("/credit-sales/settings")) {
      settings = route.request().postDataJSON();
      writes.push(settings);
      data = settings;
    }
    await route.fulfill({ json: { success: true, data } });
  });
  return writes;
}

test("credit channel selection saves and survives reload with readiness warnings", async ({ page }) => {
  const writes = await mockSettings(page);
  await page.goto("/admin/credit-sales");
  const combo = page.getByRole("button", { name: "Kredi bildirim kanalları", exact: true });
  await expect(combo).toHaveText("Uygulama içi bildirim");
  await combo.click();
  await expect(page.locator(".styled-dropdown-menu .styled-dropdown-search")).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Uygulama içi bildirim", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "SMS (bağlantı gerekli)", exact: true }).click();
  await combo.click();
  await expect(combo).toContainText("Uygulama içi bildirim, SMS");
  await expect(page.getByRole("status")).toContainText("SMS: bağlantı gerekli");
  await page.locator(".credit-form-actions button").first().click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].alertChannels).toEqual(["IN_APP", "SMS"]);
  await page.reload();
  await combo.click();
  await expect(page.getByRole("option", { name: "SMS (bağlantı gerekli)", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "Uygulama içi bildirim", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("WhatsApp uses dedicated utility template fields and requires a selected channel", async ({ page }) => {
  const writes = await mockSettings(page);
  await page.goto("/admin/credit-sales");
  const combo = page.getByRole("button", { name: "Kredi bildirim kanalları", exact: true });
  await combo.click();
  await page.getByRole("option", { name: "Uygulama içi bildirim", exact: true }).click();
  await combo.click();
  await expect(page.getByRole("alert")).toContainText("en az bir kanal");
  await expect(page.locator(".credit-form-actions button").first()).toBeDisabled();
  await combo.click();
  await page.getByRole("option", { name: "WhatsApp (bağlantı gerekli)", exact: true }).click();
  await combo.click();
  await page.getByLabel("WhatsApp hatırlatma şablonu", { exact: true }).fill("credit_reminder");
  await page.getByLabel("WhatsApp şablon dili", { exact: true }).fill("tr");
  await expect(page.getByText("Onaylı bir utility şablonu", { exact: false })).toBeVisible();
  await page.locator(".credit-form-actions button").first().click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ alertChannels: ["WHATSAPP"], whatsappCreditTemplateName: "credit_reminder", whatsappCreditTemplateLanguage: "tr" });
  await page.reload();
  await expect(page.getByLabel("WhatsApp hatırlatma şablonu", { exact: true })).toHaveValue("credit_reminder");
});

