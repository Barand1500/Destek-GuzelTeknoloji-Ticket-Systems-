import { test, expect, type Page } from "@playwright/test";

const order = { id: "order-preview", number: 42, name: "Destek kredisi", credits: 100, total: "250.00", currency: "TRY", status: "PENDING", validityDays: 365, periodMonths: null, customer: { id: "customer", name: "Test Müşteri", email: "test@example.test", phone: "5550000000" }, paymentAvailable: false };
async function mockCheckout(page: Page, status = "PENDING") {
  const requests: string[] = [];
  const bins: unknown[] = [];
  page.on("request", request => requests.push(`${request.url()} ${request.postData() ?? ""}`));
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/refresh")) data = { accessToken: "test", user: { id: "customer", name: "Test Müşteri", role: "CUSTOMER" } };
    if (path.endsWith("/customers/customer/agreements")) data = { customer: order.customer, parent: null, children: [], agreements: [], charges: [], availableCredits: 0 };
    if (path.endsWith("/checkout")) data = { ...order, status };
    if (path.endsWith("/card-info")) { bins.push(route.request().postDataJSON()); data = { available: true, bankName: "Sağlayıcı Test Bankası" }; }
    if (path.endsWith("/my/credit-store/orders")) {
      await route.fulfill({ json: { success: true, data: [{ ...order, status }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
      return;
    }
    await route.fulfill({ json: { success: true, data } });
  });
  return { requests, bins };
}

test("preview formats card input, only sends BIN, clears bank, and fits mobile", async ({ page }) => {
  const { requests, bins } = await mockCheckout(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customer/agreements?view=checkout&orderId=order-preview");
  await expect(page.getByLabel("Kart üzerindeki ad soyad")).toHaveValue("Test Müşteri");
  // Input labels intentionally use the visible floating labels.
  const card = page.getByLabel("Kart numarası", { exact: true });
  await card.fill("4111111111111111");
  await expect(card).toHaveValue("4111 1111 1111 1111");
  await expect(page.getByText("Sağlayıcı Test Bankası")).toBeVisible();
  await page.getByLabel("Son kullanma tarihi (AA/YY)").fill("1234");
  await page.getByLabel("Güvenlik kodu (CVC)").fill("987");
  await expect(page.getByRole("button", { name: "Ödeme henüz etkin değil" })).toBeDisabled();
  expect(bins).toEqual([{ bin: "41111111" }]);
  expect(requests.every(value => !value.includes("4111111111111111") && !value.includes("4111 1111 1111 1111") && !value.includes("987"))).toBe(true);
  await card.fill("555");
  await expect(page.getByText("Sağlayıcı Test Bankası")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("bank lookup starts after six digits without sending the full card", async ({ page }) => {
  const { bins } = await mockCheckout(page);
  await page.goto("/customer/agreements?view=checkout&orderId=order-preview");
  await page.getByLabel("Kart numarası", { exact: true }).fill("411111");
  await expect(page.getByText("Sağlayıcı Test Bankası")).toBeVisible();
  expect(bins).toEqual([{ bin: "411111" }]);
});

test("only pending orders expose the checkout entry", async ({ page }) => {
  await mockCheckout(page);
  await page.goto("/customer/agreements?view=orders");
  await page.getByRole("link", { name: "Ödemeye Geç" }).click();
  await expect(page.getByRole("heading", { name: "Ödeme Bilgileri" })).toBeVisible();
});

test("nonpending order cannot edit payment details", async ({ page }) => {
  await mockCheckout(page, "CANCELLED");
  await page.goto("/customer/agreements?view=checkout&orderId=order-preview");
  await expect(page.getByText(/Bu sipariş ödeme beklemiyor/)).toBeVisible();
  await expect(page.getByLabel("Kart numarası", { exact: true })).toHaveCount(0);
});
