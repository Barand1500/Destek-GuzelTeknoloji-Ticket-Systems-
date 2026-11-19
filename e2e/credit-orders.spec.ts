import { test, expect, type Page } from "@playwright/test";
const order = {
  id: "order-1",
  number: "KS-2026-001",
  kind: "TOP_UP",
  name: "Ek kredi",
  credits: 40,
  total: "125.50",
  currency: "USD",
  unitPrice: "3.1375",
  validityDays: 365,
  periodMonths: null,
  status: "PENDING",
  createdAt: "2026-11-17T08:00:00Z",
  cancelledAt: null,
  customer: { id: "customer", name: "Ali Test", company: "Örnek Şirket" },
};
async function setup(page: Page, admin = false, editable = true) {
  const requests: URL[] = [];
  let cancelled = false;
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    let data: unknown = [];
    if (url.pathname.endsWith("/auth/refresh"))
      data = {
        accessToken: "test",
        user: {
          id: "customer",
          name: "Ali Test",
          role: admin ? "ADMIN" : "CUSTOMER",
          ...(admin
            ? {
                accessRole: {
                  permissions: [
                    "integrations.view",
                    ...(editable ? ["integrations.update"] : []),
                  ],
                },
              }
            : {}),
        },
      };
    if (url.pathname.endsWith("/customers/customer/agreements"))
      data = {
        customer: { id: "customer", name: "Ali Test" },
        parent: null,
        children: [],
        agreements: [],
        charges: [],
        availableCredits: 0,
      };
    if (url.pathname.endsWith("/credit-sales"))
      data = {
        settings: {
          currency: "TRY",
          enabled: true,
          unitPrice: "1",
          minCredits: 1,
          maxCredits: 1000,
          validityDays: 365,
        },
        plans: [],
      };
    if (url.pathname.endsWith("/orders")) {
      requests.push(url);
      return route.fulfill({
        json: {
          success: true,
          data: [{ ...order, status: cancelled ? "CANCELLED" : "PENDING" }],
          pagination: {
            page: Number(url.searchParams.get("page") || 1),
            limit: 20,
            total: 21,
            totalPages: 2,
          },
        },
      });
    }
    if (url.pathname.endsWith("/order-1/cancel")) cancelled = true;
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto(
    admin
      ? "/admin/credit-sales?view=orders"
      : "/customer/agreements?view=orders",
  );
  return { requests };
}
test("customer sees original price and cancels only after confirmation", async ({
  page,
}) => {
  await setup(page);
  await expect(page.getByText(order.number, { exact: true })).toBeVisible();
  await expect(page.getByText("125,50", { exact: false })).toBeVisible();
  const pay = page.getByRole("link", { name: "Ödemeye Geç", exact: true }).first();
  const cancelButton = page.getByRole("button", { name: "Siparişi İptal Et", exact: true }).first();
  const payBox = await pay.boundingBox();
  const cancelBox = await cancelButton.boundingBox();
  expect(payBox && cancelBox ? cancelBox.x - (payBox.x + payBox.width) : 0).toBeGreaterThanOrEqual(8);
  await cancelButton.click();
  const dialog = page.getByRole("dialog", { name: "Siparişi İptal Et" });
  await expect(dialog).toContainText("Kredi bakiyeniz değişmez");
  const viewport = page.viewportSize()!;
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(Math.abs(dialogBox!.x + dialogBox!.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(Math.abs(dialogBox!.y + dialogBox!.height / 2 - viewport.height / 2)).toBeLessThan(2);
  await dialog.getByRole("button", { name: "İptali Onayla" }).click();
  await expect(page.getByText("İptal edildi", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Siparişi İptal Et", exact: true }),
  ).toHaveCount(0);
});
test("pagination and debounced filters request server pages", async ({
  page,
}) => {
  const { requests } = await setup(page);
  await expect(page.getByText(order.number, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get("page")).toBe("2");
  await page.getByRole("textbox", { name: "Sipariş Ara" }).fill("KS-2026");
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("search"))
    .toBe("KS-2026");
  expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
  await page.getByRole("button", { name: "Sipariş Durumu" }).click();
  await page.getByRole("option", { name: "İptal edildi", exact: true }).click();
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("status"))
    .toBe("CANCELLED");
});
test("read-only admin sees customer and cannot cancel", async ({ page }) => {
  await setup(page, true, false);
  await expect(page.getByText(order.number, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Müşteri", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Siparişi İptal Et", exact: true }),
  ).toHaveCount(0);
});

test("empty results keep filters usable and show an empty state", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/my/credit-store/orders?**", (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    }),
  );
  await page.reload();
  await expect(
    page.getByText("Bu görünümde sipariş bulunamadı.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Sipariş Ara" }),
  ).toBeEnabled();
});

test("failed list requests show a retry action", async ({ page }) => {
  await setup(page);
  await page.route("**/api/v1/my/credit-store/orders?**", (route) =>
    route.fulfill({
      status: 400,
      json: { success: false, message: "Siparişler yüklenemedi." },
    }),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "Tekrar Dene" })).toBeVisible({
    timeout: 15000,
  });
});

test('unresolved payments explain and disable cancellation and repeat payment', async ({ page }) => {
  await setup(page);
  await page.route('**/api/v1/my/credit-store/orders?**', route => route.fulfill({ json: { success: true, data: [{ ...order, paymentInProgress: true }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } }));
  await page.reload();
  await expect(page.getByText('Banka sonucu kontrol ediliyor.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Siparişi İptal Et' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Ödemeye Geç' })).toHaveCount(0);
});

test('customer cancellation confirmation follows the dark theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('helpdesk-theme', 'dark'));
  await setup(page);
  await page.getByRole('button', { name: 'Siparişi İptal Et', exact: true }).first().click();
  const confirm = page.getByRole('dialog').getByRole('button', { name: 'İptali Onayla' });
  await expect(confirm).toHaveCSS('background-color', 'rgb(85, 47, 44)');
  await expect(confirm).toHaveCSS('color', 'rgb(255, 210, 205)');
  await confirm.hover();
  await expect(confirm).toHaveCSS('background-color', 'rgb(106, 57, 52)');
});
