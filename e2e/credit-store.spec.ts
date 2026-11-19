import { test, expect } from "@playwright/test";
const settings = {
  currency: "TRY",
  enabled: true,
  unitPrice: "2.50",
  minCredits: 1,
  maxCredits: 10000,
  validityDays: 365,
};
const plan = {
  currency: "TRY",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Standart Destek",
  description: "İşletmeniz için düzenli destek.",
  periodMonths: 1,
  price: "1000.00",
  credits: 500,
  active: true,
};
const owner = { id: "company", name: "Güzel Teknoloji", isCompany: true };
async function mockApi(page: any, role: string) {
  const writes: any[] = [];
  await page.route("**/api/v1/**", async (route: any) => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path.endsWith("/auth/refresh"))
      data = {
        accessToken: "test",
        user: { id: "customer", name: "Test Kullanıcı", role },
      };
    if (path.endsWith("/credit-sales")) data = { settings, plans: [plan] };
    if (path.endsWith("/credit-sales/settings")) {
      writes.push(route.request().postDataJSON());
      data = route.request().postDataJSON();
    }
    if (path.endsWith("/credit-sales/plans")) {
      writes.push(route.request().postDataJSON());
      data = { ...route.request().postDataJSON(), id: plan.id };
    }
    if (path.endsWith("/my/credit-store"))
      data = { settings, plans: [plan], owner, paymentAvailable: false };
    if (path.endsWith("/my/credit-store/quote")) {
      const input = route.request().postDataJSON();
      writes.push(input);
      data = {
        owner,
        quoteKey: "a".repeat(64),
        name: input.planId ? plan.name : "Ek kredi",
        credits: input.planId ? 500 : 10,
        total: input.planId ? "1000.00" : "25.00",
        validityDays: input.planId ? null : 365,
        periodMonths: input.planId ? 1 : null,
        paymentAvailable: false,
      };
    }
    if (
      path.endsWith("/my/credit-store/orders") &&
      route.request().method() === "POST"
    ) {
      const input = route.request().postDataJSON();
      writes.push(input);
      data = { id: "order-1", number: 1 };
    }
    if (path.endsWith("/customers/customer/agreements"))
      data = {
        customer: { id: "customer", name: "Test Kullanıcı" },
        parent: null,
        companyName: "Güzel Teknoloji",
        children: [],
        agreements: [],
        charges: [],
        availableCredits: 0,
      };
    if (path.endsWith("/my/credit-store/orders/order-1/checkout"))
      data = {
        id: "order-1",
        number: 1,
        name: "Ek kredi",
        credits: 10,
        total: "25.00",
        currency: "TRY",
        status: "PENDING",
        validityDays: 365,
        periodMonths: null,
        customer: {
          id: "customer",
          name: "Test Kullanıcı",
          email: "test@example.test",
          phone: "5550000000",
        },
      };
    await route.fulfill({ json: { success: true, data } });
  });
  return writes;
}
test("admin can edit saved credit pricing and open plan editor", async ({
  page,
}) => {
  const writes = await mockApi(page, "ADMIN");
  await page.goto("/admin/credit-sales");
  await expect(
    page.getByRole("heading", { name: "Kredi ve Paket Ayarları" }),
  ).toBeVisible();
  await page.getByLabel("1 kredi fiyatı (TL)").fill("3,50");
  await page.getByRole("button", { name: "Ayarları Kaydet" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].unitPrice).toBe("3.50");
  await page.getByRole("button", { name: "Plan Ekle" }).click();
  await expect(page.getByLabel("Dönem boyunca toplam kredi")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Kredi satışını etkinleştir" }),
  ).toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Müşterilere göster" }),
  ).not.toBeChecked();
  const tops = await page
    .locator(".credit-settings-fields > *")
    .evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().top)),
    );
  expect(new Set(tops).size).toBe(1);

  await page.screenshot({
    path: "test-results/credit-sales-admin.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Gece Moduna Geç" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("Dönem fiyatı (TL)").fill("1400ada");
  await page
    .getByLabel("Açıklama", { exact: true })
    .fill("Destek planı açıklaması");
  await expect(page.getByLabel("Dönem fiyatı (TL)")).toHaveValue("1.400,00");
  await expect(page.getByLabel("Abonelik dönemi", { exact: true })).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.getByLabel("Açıklama", { exact: true })).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(page.getByLabel("Dönem boyunca toplam kredi")).toHaveCSS(
    "appearance",
    "textfield",
  );
  await page.screenshot({
    path: "test-results/credit-sales-admin-dark.png",
    fullPage: true,
  });
  await page.getByLabel("Plan adı").fill("Dolar Planı");
  await page.getByRole("button", { name: "Plan para birimi" }).click();
  await page.getByRole("option", { name: "ABD Doları ($)" }).click();
  await page.getByRole("button", { name: "Planı Kaydet" }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].currency).toBe("USD");
  expect(writes[1].price).toBe("1400");
});
test("customer calculates credit both ways, previews plans and cannot start payment", async ({
  page,
}) => {
  const writes = await mockApi(page, "CUSTOMER");
  await page.goto("/customer/agreements");
  await page.getByRole("tab", { name: "Kredi Yükle ve Paketler" }).click();
  await page.getByLabel("Kredi için ödenecek tutar").fill("25,00");
  await expect(page.getByLabel("Satın alınacak kredi sayısı")).toHaveValue(
    "10",
  );
  await page.getByRole("button", { name: "Özeti Gör" }).click();
  await expect(
    page.getByRole("heading", { name: "Satın Alma Özeti" }),
  ).toBeVisible();
  expect(writes[0]).toEqual({ amount: "25.00" });
  await page.getByRole("button", { name: "Sipariş Oluştur" }).click();
  await expect(page).toHaveURL(/view=checkout&orderId=order-1/);
  await expect(page.getByRole("heading", { name: "Ödeme Özeti" })).toBeVisible();
  expect(writes[1].selection).toEqual({ amount: "25.00" });
  expect(writes[1].quoteKey).toBe("a".repeat(64));
  expect(writes[1].requestKey).toMatch(/^[a-f0-9-]{36}$/);

  await page.goto("/customer/agreements");
  await page.getByRole("tab", { name: "Kredi Yükle ve Paketler" }).click();
  await page.screenshot({
    path: "test-results/credit-store-customer.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Abonelikler", exact: true }).click();
  await page.getByRole("button", { name: "Planı İncele" }).click();
  await expect(page.locator(".credit-quote")).toContainText("Standart Destek");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".credit-plan-card")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/credit-store-mobile.png",
    fullPage: true,
  });
});

test("price refresh clears stale calculator values before another preview", async ({
  page,
}) => {
  await page.clock.install();
  await mockApi(page, "CUSTOMER");
  let unitPrice = "2.50";
  await page.route("**/api/v1/my/credit-store", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          settings: { ...settings, unitPrice },
          plans: [plan],
          owner,
          paymentAvailable: false,
        },
      },
    }),
  );
  await page.goto("/customer/agreements");
  await page.getByRole("tab", { name: "Kredi Yükle ve Paketler" }).click();
  await page.getByLabel("Satın alınacak kredi sayısı").fill("10");
  await expect(page.getByLabel("Kredi için ödenecek tutar")).toHaveValue(
    "25,00",
  );
  unitPrice = "3.00";
  await page.route("**/api/v1/my/credit-store", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          settings: { ...settings, unitPrice: "3.00" },
          plans: [plan],
          owner,
          paymentAvailable: false,
        },
      },
    }),
  );
  await page.getByRole("button", { name: "Fiyatları Yenile" }).click();
  await expect(
    page.locator(".credit-purchase-info .credit-price"),
  ).toContainText("3,00");
  await expect(page.getByLabel("Satın alınacak kredi sayısı")).toHaveValue("");
  await expect(page.getByLabel("Kredi için ödenecek tutar")).toHaveValue("");
});

test("linked company people cannot see the purchase entry", async ({
  page,
}) => {
  await mockApi(page, "CUSTOMER");
  let calls = 0;
  await page.route("**/api/v1/my/credit-store", (route) => {
    calls++;
    return route.fulfill({ status: 403, json: { success: false } });
  });
  await page.route("**/api/v1/customers/customer/agreements", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          customer: {
            id: "customer",
            name: "Bağlı Kişi",
            parentCustomerId: "company",
          },
          parent: { id: "company", name: "Şirket Sahibi" },
          companyName: "Güzel Teknoloji",
          children: [],
          agreements: [],
          charges: [],
          availableCredits: 0,
        },
      },
    }),
  );
  await page.goto("/customer/agreements");
  await expect(
    page.getByText("Güzel Teknoloji", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Kredi Yükle ve Paketler" }),
  ).toHaveCount(0);
  expect(calls).toBe(0);
});

test("unchanged catalog refresh keeps credit and plan previews open", async ({
  page,
}) => {
  await mockApi(page, "CUSTOMER");
  await page.goto("/customer/agreements?view=store");
  await page.getByLabel("Satın alınacak kredi sayısı").fill("10");
  await page.getByRole("button", { name: "Özeti Gör" }).click();
  await expect(page.locator(".credit-quote")).toBeVisible();
  await page.getByRole("button", { name: "Fiyatları Yenile" }).click();
  await expect(
    page.getByRole("button", { name: "Fiyatları Yenile" }),
  ).toBeEnabled();
  await expect(page.locator(".credit-quote")).toBeVisible();
  await page.getByRole("button", { name: "Abonelikler", exact: true }).click();
  await page.getByRole("button", { name: "Planı İncele" }).click();
  await expect(page.locator(".credit-quote")).toContainText("Standart Destek");
  await page.getByRole("button", { name: "Fiyatları Yenile" }).click();
  await expect(
    page.getByRole("button", { name: "Fiyatları Yenile" }),
  ).toBeEnabled();
  await expect(page.locator(".credit-quote")).toContainText("Standart Destek");
});

test("customer credit input formats whole credits and strips letters", async ({
  page,
}) => {
  await mockApi(page, "CUSTOMER");
  await page.goto("/customer/agreements?view=store");
  const input = page.getByLabel("Satın alınacak kredi sayısı");
  await input.fill("10000");
  await input.blur();
  await expect(input).toHaveValue("10.000");
  await input.focus();
  await expect(input).toHaveValue("10000");
  await input.fill("180ü");
  await expect(input).toHaveValue("180");
  await input.blur();
  await expect(page.getByLabel("Kredi için ödenecek tutar")).toHaveValue(
    "450,00",
  );
  await input.fill("1,5");
  await expect(input).toHaveValue("180");
});

test("credit count can be typed up to 10000 and erased one digit at a time", async ({
  page,
}) => {
  await mockApi(page, "CUSTOMER");
  await page.goto("/customer/agreements?view=store");
  const input = page.getByLabel("Satın alınacak kredi sayısı");
  await input.pressSequentially("10000");
  await input.blur();
  await expect(input).toHaveValue("10.000");
  await input.focus();
  await input.press("End");
  for (let i = 0; i < 5; i++) await input.press("Backspace");
  await expect(input).toHaveValue("");
  await input.pressSequentially("1000");
  await input.press("Backspace");
  await expect(input).toHaveValue("100");
});

test('switching packages shows remaining time and requires end-of-period confirmation', async ({ page }) => {
  const writes = await mockApi(page, 'CUSTOMER');
  await page.route('**/api/v1/my/credit-store/quote', route => route.fulfill({ json: { success: true, data: {
    owner, name: plan.name, kind: 'SUBSCRIPTION', quoteKey: 'a'.repeat(64), credits: 500, total: '1000.00', currency: 'TRY', periodMonths: 1, renewalRequested: true, paymentAvailable: false,
    startsOn: '2026-12-01', endsOn: '2026-12-31', currentPackage: { id: 'current', name: 'Mevcut Destek', remainingDays: 12, endsOn: '2026-11-30' }
  } } }));
  await page.goto('/customer/agreements?view=store');
  await page.getByRole('button', { name: 'Abonelikler', exact: true }).click();
  await page.getByRole('button', { name: 'Planı İncele' }).click();
  await expect(page.getByText(/Döneminizin bitmesine 12 gün var/)).toBeVisible();
  await expect(page.getByText('Yeni paketin mevcut dönem bittikten sonra başlamasını onaylıyorum.')).toBeVisible();
  await expect(page.getByText(/Mevcut paketin yenilemesini kapatıp/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sipariş Oluştur' })).toBeDisabled();
  await page.locator('.credit-quote .credit-renewal-choice').click();
  await expect(page.getByRole('button', { name: 'Sipariş Oluştur' })).toBeEnabled();
  await page.getByRole('button', { name: 'Sipariş Oluştur' }).click();
  await expect.poll(() => writes.find(value => value.confirmPackageChange === true)).toBeTruthy();
});

test('Akbank catalog does not promise automatic renewal', async ({ page }) => {
  const writes = await mockApi(page, 'CUSTOMER');
  await page.route('**/api/v1/my/credit-store', route => route.fulfill({ json: { success: true, data: { settings, plans: [{ ...plan, renewalRequested: true }], owner, provider: 'akbank', paymentAvailable: true, recurringAvailable: false } } }));
  await page.goto('/customer/agreements?view=store');
  await page.getByRole('button', { name: 'Abonelikler', exact: true }).click();
  const toggle = page.getByRole('switch', { name: plan.name + ' dönem sonunda tekrarla' });
  await expect(toggle).toBeDisabled();
  await expect(toggle).not.toBeChecked();
  await page.getByRole('button', { name: 'Planı İncele' }).click();
  await expect.poll(() => writes.find(value => value.planId === plan.id)?.renewalRequested).toBe(false);
  await expect(page.getByRole('switch', { name: 'Özette dönem sonunda tekrarla' })).toBeDisabled();
});


test('customer billing uses integration tabs for orders and subscriptions', async ({ page }) => {
  await mockApi(page, 'CUSTOMER');
  await page.route('**/api/v1/my/credit-store/subscriptions*', route => route.fulfill({ json: { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1 } } }));
  await page.route('**/api/v1/my/credit-store/orders?*', route => route.fulfill({ json: { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1 } } }));
  await page.goto('/customer/agreements?view=subscriptions');
  const tabs = page.locator('.customer-billing-workspace .integration-subtabs');
  await expect(tabs).toBeVisible();
  await expect(tabs).toHaveCSS('display', 'flex');
  const subscriptions = tabs.getByRole('tab').nth(1);
  await expect(subscriptions).toHaveAttribute('aria-selected', 'true');
  await expect(subscriptions).toHaveCSS('border-bottom-style', 'solid');
  await tabs.getByRole('tab').first().click();
  await expect(page).toHaveURL(/view=orders/);
  await expect(tabs.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.credit-orders h2')).toBeVisible();
});

test('staff billing uses the same styled integration tabs', async ({ page }) => {
  await mockApi(page, 'ADMIN');
  await page.route('**/api/v1/credit-sales/orders?*', route => route.fulfill({ json: { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1 } } }));
  await page.route('**/api/v1/credit-sales/subscriptions*', route => route.fulfill({ json: { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1 } } }));
  await page.goto('/admin/credit-sales?view=orders');
  const tabs = page.getByRole('tablist', { name: 'Sipariş ve abonelik yönetimi' });
  await expect(tabs).toHaveCSS('display', 'flex');
  await tabs.getByRole('tab', { name: 'Abonelikler', exact: true }).click();
  await expect(tabs.getByRole('tab', { name: 'Abonelikler', exact: true })).toHaveAttribute('aria-selected', 'true');
});


test('admin can delete a sales plan after confirmation', async ({ page }) => {
  await mockApi(page, 'ADMIN');
  let removed = false;
  await page.route('**/api/v1/credit-sales', route => route.fulfill({ json: { success: true, data: { settings, plans: removed ? [] : [plan] } } }));
  await page.route('**/api/v1/credit-sales/plans/' + plan.id, route => {
    expect(route.request().method()).toBe('DELETE');
    removed = true;
    return route.fulfill({ json: { success: true, data: null } });
  });
  await page.goto('/admin/credit-sales');
  await page.getByRole('button', { name: /Standart Destek plan/ }).click();
  expect(removed).toBe(false);
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Sil', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.credit-admin-plans article')).toHaveCount(0);
  expect(removed).toBe(true);
});
