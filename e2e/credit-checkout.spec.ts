import { test, expect, type Page } from '@playwright/test';
const order = { id: 'order-preview', number: 42, name: 'Destek kredisi', credits: 100, total: '250.00', currency: 'TRY', status: 'PENDING', validityDays: 365, periodMonths: null, customer: { id: 'customer', name: 'Test Müşteri', email: 'test@example.test', phone: '05550000000' }, paymentAvailable: true };
async function mockCheckout(page: Page, available = true, status = 'PENDING') {
  const writes: any[] = [];
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'customer', name: 'Test Müşteri', role: 'CUSTOMER' } };
    if (path.endsWith('/customers/customer/agreements')) data = { customer: order.customer, parent: null, children: [], agreements: [], charges: [], availableCredits: 0 };
    if (path.endsWith('/checkout')) {
      if (status === 'CANCELLED') return route.fulfill({ status: 409, json: { success: false, error: { code: 'ORDER_NOT_PENDING', message: 'Bu sipariş ödeme beklemiyor.' } } });
      data = { ...order, status, paymentAvailable: available };
    }
    if (path.endsWith('/pay')) { writes.push(route.request().postDataJSON()); data = { paymentUrl: 'https://sandbox-cpp.iyzipay.com/?token=fixture' }; }
    if (path.endsWith('/my/credit-store/orders')) return route.fulfill({ json: { success: true, data: [{ ...order, status }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    await route.fulfill({ json: { success: true, data } });
  });
  return writes;
}
test('hosted checkout collects billing only and redirects without card data', async ({ page }) => {
  const writes = await mockCheckout(page);
  await page.route('https://sandbox-cpp.iyzipay.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Secure provider checkout</h1>' }));
  await page.goto('/customer/agreements?view=checkout&orderId=order-preview');
  await expect(page.getByRole('heading', { name: 'Ödeme Özeti' })).toBeVisible();
  await expect(page.getByLabel('Ad *', { exact: true })).toHaveValue('Test');
  await expect(page.getByLabel(/Kart numarası|CVC|Son kullanma/)).toHaveCount(0);
  await page.getByLabel('T.C. Kimlik No *').fill('11111111111');
  await page.getByLabel('Şehir *').fill('Istanbul');
  await page.getByLabel('Fatura adresi *').fill('Test billing address');
  await page.getByRole('button', { name: /Ödemeye Geç/ }).click();
  await expect(page).toHaveURL(/sandbox-cpp\.iyzipay\.com/);
  expect(writes).toHaveLength(1);
  expect(writes[0].identityNumber).toBe('11111111111');
  expect(Object.keys(writes[0])).not.toEqual(expect.arrayContaining(['cardNumber', 'cvc', 'expiry']));
});
test('disabled checkout shows a truthful unpaid summary and fits mobile', async ({ page }) => {
  await mockCheckout(page, false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/customer/agreements?view=checkout&orderId=order-preview');
  await expect(page.getByText(/Online ödeme şu anda kapalı/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Ödemeye Geç/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test('orders link opens checkout and cancelled orders cannot pay', async ({ page }) => {
  await mockCheckout(page);
  await page.goto('/customer/agreements?view=orders');
  await page.getByRole('link', { name: 'Ödemeye Geç' }).click();
  await expect(page.getByRole('heading', { name: 'Ödeme Özeti' })).toBeVisible();
});
test('cancelled checkout rejects payment details', async ({ page }) => {
  await mockCheckout(page, true, 'CANCELLED');
  await page.goto('/customer/agreements?view=checkout&orderId=order-preview');
  await expect(page.getByText('Bu sipariş ödeme beklemiyor.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ödemeye Geç/ })).toHaveCount(0);
});
