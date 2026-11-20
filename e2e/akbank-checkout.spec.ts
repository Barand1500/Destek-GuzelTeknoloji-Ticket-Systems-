import { test, expect } from '@playwright/test';

test('Akbank card entry stays in portal then posts to bank 3D without billing fields', async ({ page }) => {
  const writes: any[] = [];
  const order = { id: 'akbank-order', number: 55, name: 'Destek kredisi', credits: 1000, total: '12750.00', currency: 'TRY', status: 'PENDING', paymentAvailable: true, provider: 'akbank', renewalRequested: true, customer: { id: 'customer', name: 'Test User' } };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'customer', name: 'Test User', role: 'CUSTOMER' } };
    if (path.endsWith('/customers/customer/agreements')) data = { customer: order.customer, parent: null, children: [], agreements: [], charges: [], availableCredits: 0 };
    if (path.endsWith('/checkout')) data = order;
    if (path.endsWith('/pay')) { writes.push(route.request().postDataJSON()); data = { action: 'https://virtualpospaymentgatewaypre.akbank.com/securepay', fields: { paymentModel: '3D_PAY', orderId: 'bank-attempt', creditCard: '4111111111111111', expiredDate: '1230', cvv: '123' } }; }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.route('https://virtualpospaymentgatewaypre.akbank.com/securepay', async route => {
    expect(route.request().method()).toBe('POST');
    const form = new URLSearchParams(route.request().postData()!);
    expect(form.get('paymentModel')).toBe('3D_PAY');
    expect(form.get('creditCard')).toBe('4111111111111111');
    await route.fulfill({ contentType: 'text/html', body: '<h1>Bank 3D verification</h1>' });
  });
  await page.goto('/customer/agreements?view=checkout&orderId=akbank-order');
  const panel = page.getByRole('form', { name: 'Kart ile ödeme' });
  await expect(panel).toBeVisible();
  await expect(page.getByLabel(/Fatura adresi|T.C. Kimlik/)).toHaveCount(0);
  await expect(panel.getByRole('switch')).toHaveCount(0);
  await panel.getByLabel('Kart üzerindeki ad soyad').fill('TEST USER');
  await panel.getByLabel('Kart numarası').fill('4111111111111111');
  await expect(panel.getByLabel('Kart numarası')).toHaveValue('4111 1111 1111 1111');
  await panel.getByLabel('Son kullanma tarihi').fill('1230');
  await expect(panel.getByLabel('Son kullanma tarihi')).toHaveValue('12 / 30');
  await panel.getByLabel('CVC').fill('123');
  await panel.screenshot({ path: 'test-results/akbank-card-light.png' });
  await page.getByRole('button', { name: 'Gece Moduna Geç' }).click();
  await panel.screenshot({ path: 'test-results/akbank-card-dark.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.getByRole('button', { name: /Öde$/ }).click();
  await expect(page.getByRole('heading', { name: 'Bank 3D verification' })).toBeVisible();
  expect(writes).toEqual([{ card: { holder: 'TEST USER', number: '4111111111111111', expiry: '1230', cvc: '123' } }]);
});
