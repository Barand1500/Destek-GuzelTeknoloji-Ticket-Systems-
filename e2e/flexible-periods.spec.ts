import { test, expect, type Page } from "@playwright/test";

async function setup(page: Page, role: string) {
  const writes: { path: string; body: any }[] = [];
  const settings = {
    currency: "TRY",
    enabled: true,
    unitPrice: "2.50",
    minCredits: 1,
    maxCredits: 10000,
    validityDays: 365,
  };
  const owner = { id: "customer", name: "Test", isCompany: false };
  const plan = {
    id: "plan",
    name: "Esnek Destek",
    description: "",
    periodMonths: null,
    periodDays: 15,
    periodName: "Kısa dönem",
    renewalRequested: false,
    currency: "TRY",
    price: "1000",
    credits: 100,
    active: true,
  };
  const periods: any[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = ["POST", "PUT"].includes(route.request().method())
      ? route.request().postDataJSON()
      : null;
    if (body) writes.push({ path, body });
    let data: any = [];
    if (path.endsWith("/auth/refresh"))
      data = {
        accessToken: "test",
        user: { id: "customer", name: "Test", role },
      };
    if (path.endsWith("/credit-sales")) data = { settings, plans: [plan] };
    if (path.endsWith("/credit-sales/periods")) {
      if (body)
        periods.push({
          id: `period${periods.length}`,
          name: body.name,
          unit: body.startsOn ? "DAY" : body.unit,
          value: body.startsOn
            ? (Date.parse(body.endsOn) - Date.parse(body.startsOn)) / 86400000 +
              1
            : body.value,
        });
      data = body ? periods.at(-1) : periods;
    }
    if (path.endsWith("/credit-sales/plans")) data = { ...body, id: "saved" };
    if (path.endsWith("/my/credit-store"))
      data = { settings, plans: [plan], owner, paymentAvailable: false };
    if (path.endsWith("/my/credit-store/quote"))
      data = {
        quoteKey: "a".repeat(64),
        name: plan.name,
        credits: 100,
        total: "1000",
        currency: "TRY",
        validityDays: 15,
        periodMonths: null,
        periodName: plan.periodName,
        renewalRequested: body.renewalRequested,
        owner,
        paymentAvailable: false,
      };
    if (path.endsWith("/my/credit-store/orders") && body)
      data = { id: "order", number: 1 };
    if (path.endsWith("/customers/customer/agreements"))
      data = {
        customer: owner,
        parent: null,
        children: [],
        agreements: [],
        charges: [],
        availableCredits: 0,
      };
    await route.fulfill({ json: { success: true, data } });
  });
  return writes;
}

test("admin saves named calendar duration without renewal preference", async ({
  page,
}) => {
  const writes = await setup(page, "ADMIN");
  await page.goto("/admin/credit-sales");
  await page.getByRole("button", { name: "Plan Ekle", exact: true }).click();
  await page.getByLabel("Plan adı").fill("Takvim planı");
  await page
    .getByRole("textbox", { name: "Abonelik d\u00f6nemi", exact: true })
    .click();
  await page.getByLabel("Yeni dönem adı", { exact: true }).fill("İki haftalık");
  await page.getByRole("button", { name: "Dönem takvimini aç" }).click();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth(), 14);
  const label = (date: Date) =>
    date.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  const iso = (date: Date) =>
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  await page.getByRole("button", { name: label(start), exact: true }).click();
  await page.screenshot({
    path: "test-results/flexible-period-calendar.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: label(end), exact: true }).click();
  await expect(
    page.getByText("14 gün (dahil)", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Dönem tarih aralığı" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/flexible-period-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dönem Ekle", exact: true }).click();
  await page.getByLabel("Plan adı").click();
  await expect(
    page.getByRole("textbox", { name: "Abonelik d\u00f6nemi", exact: true }),
  ).toHaveValue("İki haftalık (14 gün)");
  await page.getByLabel("Dönem fiyatı (TL)").fill("150");
  await expect(page.getByRole("switch", { name: /dönem sonunda tekrarla/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Planı Kaydet" }).click();
  await expect
    .poll(
      () => writes.find((w) => w.path.endsWith("/credit-sales/plans"))?.body,
    )
    .toMatchObject({
      periodMonths: null,
      periodDays: 14,
      periodName: "İki haftalık",
    });
  expect(
    writes.find((w) => w.path.endsWith("/credit-sales/periods"))?.body,
  ).toEqual({
    name: "İki haftalık",
    startsOn: iso(start),
    endsOn: iso(end),
  });
});

test("customer quote and pending order contain only the selected package", async ({
  page,
}) => {
  const writes = await setup(page, "CUSTOMER");
  await page.goto("/customer/agreements?view=store");
  await page.getByRole("button", { name: "Abonelikler", exact: true }).click();
  await expect(page.getByText("Kısa dönem (15 gün) DESTEK")).toBeVisible();
  await expect(page.getByRole("switch", { name: /dönem sonunda tekrarla/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Planı İncele" }).click();
  await expect(page.locator(".credit-quote")).toContainText("15 gün");
  await expect(page.locator(".credit-quote")).not.toContainText("Dönem sonunda tekrarla");
  await page.screenshot({
    path: "test-results/flexible-period-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sipariş Oluştur" }).click();
  await expect
    .poll(
      () =>
        writes.find((w) => w.path.endsWith("/my/credit-store/orders"))?.body
          .selection,
    )
    .toEqual({ planId: "plan" });
  expect(
    writes.find((w) => w.path.endsWith("/my/credit-store/quote"))?.body,
  ).toEqual({ planId: "plan" });
});

test("admin selects built-in calendar months and preserves editor terms", async ({
  page,
}) => {
  const writes = await setup(page, "ADMIN");
  await page.goto("/admin/credit-sales");
  await page.getByRole("button", { name: "Düzenle", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Abonelik d\u00f6nemi", exact: true }),
  ).toHaveValue("Kısa dönem (15 gün)");
  await page.getByLabel("Plan adı").fill("Düzenlenen plan");
  await page.getByRole("button", { name: "Planı Kaydet" }).click();
  await expect
    .poll(
      () =>
        writes.find((w) => w.path.endsWith("/credit-sales/plans/plan"))?.body,
    )
    .toMatchObject({
      periodMonths: null,
      periodDays: 15,
      periodName: "Kısa dönem",

    });
  await page.getByRole("button", { name: "Plan Ekle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Abonelik d\u00f6nemi", exact: true })
    .click();
  await page.getByRole("option", { name: "3 ay", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Abonelik d\u00f6nemi", exact: true }),
  ).toHaveValue("3 ay");
  await page.getByLabel("Plan adı").fill("Üç aylık plan");
  await page.getByLabel("Dönem fiyatı (TL)").fill("300");
  await page.getByRole("button", { name: "Planı Kaydet" }).click();
  await expect
    .poll(
      () => writes.find((w) => w.path.endsWith("/credit-sales/plans"))?.body,
    )
    .toMatchObject({ periodMonths: 3, periodDays: null });
});

test("compact period footer supports a range across months on mobile", async ({
  page,
}) => {
  const writes = await setup(page, "ADMIN");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/credit-sales");
  await page.getByRole("button", { name: "Plan Ekle", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Abonelik d\u00f6nemi", exact: true })
    .click();
  await page.getByLabel("Yeni dönem adı").fill("Ay geçişi");
  await page.getByRole("button", { name: "Dönem takvimini aç" }).click();
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 2);
  const label = (date: Date) =>
    date.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  await page.getByRole("button", { name: label(start), exact: true }).click();
  await page
    .getByRole("button", { name: "Dönem sonraki ay", exact: true })
    .click();
  await page.getByRole("button", { name: label(end), exact: true }).click();
  await expect(page.locator(".credit-period-range-summary")).toContainText(
    "3 gün (dahil)",
  );
  await page.getByRole("button", { name: "Dönem Ekle", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Abonelik d\u00f6nemi", exact: true }),
  ).toHaveValue("Ay geçişi (3 gün)");
  expect(
    writes.find((w) => w.path.endsWith("/credit-sales/periods"))?.body.name,
  ).toBe("Ay geçişi");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("range calendar remains usable after dropdown is closed and reopened", async ({
  page,
}) => {
  await setup(page, "ADMIN");
  await page.goto("/admin/credit-sales");
  await page.getByRole("button", { name: "Plan Ekle", exact: true }).click();
  const field = page.getByRole("textbox", {
    name: "Abonelik dönemi",
    exact: true,
  });
  await field.click();
  await page.getByRole("button", { name: "Dönem takvimini aç" }).click();
  await expect(
    page.getByRole("group", { name: "Dönem tarih aralığı" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Abonelik dönemi seçenekleri", exact: true })
    .click();
  await field.click();
  await expect(
    page.getByRole("group", { name: "Dönem tarih aralığı" }),
  ).toBeVisible();
});
