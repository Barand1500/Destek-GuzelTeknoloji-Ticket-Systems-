import { test, expect } from '@playwright/test';

for (const status of ['PAID', 'PARTIAL_REFUND']) {
  test('top-up customer can request review without direct reversal for ' + status, async ({ page }) => {
    const writes: string[] = [];
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (route.request().method() === 'POST' && !path.endsWith('/auth/refresh')) writes.push(path);
      let data: unknown = [];
      if (path.endsWith('/orders/order/reversals')) data = { orderKind: 'TOP_UP', canCancel: true, canSelfRefund: false, usedCredits: 0, refundableCredits: 100, refundableAmount: '250.00', total: '250.00', currency: 'TRY', originalCredits: 100, hasPending: false, data: [] };
      if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'customer', name: 'Test User', role: 'CUSTOMER' } };
      if (path.endsWith('/customers/customer/agreements')) data = { customer: { id: 'customer', name: 'Test User' }, parent: null, children: [], agreements: [], charges: [], availableCredits: 100 };
      if (path.endsWith('/orders')) return route.fulfill({ json: { success: true, data: [{ id: 'order', number: 7, name: 'Customer package', kind: 'TOP_UP', credits: 100, usedCredits: 10, total: '250.00', currency: 'TRY', validityDays: 30, paidAt: new Date().toISOString(), status, createdAt: new Date().toISOString() }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/customer/agreements?view=orders');
    await expect(page.getByRole('cell', { name: 'Customer package', exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'İade Talep Et', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /İade Et|Ödemeyi İptal Et/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'İade Talep Et', exact: true }).click();
    await expect(page.getByRole('button', { name: /İadeyi Onayla|Ödeme İptalini Onayla/ })).toHaveCount(0);
    await page.getByLabel('İade talep nedeni').fill('Please review my unused credit');
    await page.getByRole('button', { name: 'İade Talebini Gönder', exact: true }).click();
    await expect.poll(() => writes).toEqual(['/api/v1/my/credit-store/orders/order/refund-request']);
  });
}

test('unused subscription keeps direct payment cancellation', async ({ page }) => {
 await page.route('**/api/v1/**', async route => {
  const path = new URL(route.request().url()).pathname;
  let data: unknown = [];
  if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'customer', name: 'Test User', role: 'CUSTOMER' } };
  if (path.endsWith('/customers/customer/agreements')) data = { customer: { id: 'customer', name: 'Test User' }, parent: null, children: [], agreements: [], charges: [], availableCredits: 100 };
  if (path.endsWith('/orders')) return route.fulfill({ json: { success: true, data: [{ id: 'order', number: 8, name: 'Subscription package', kind: 'SUBSCRIPTION', credits: 100, usedCredits: 0, canBankCancel: true, total: '250.00', currency: 'TRY', validityDays: 30, status: 'PAID', createdAt: new Date().toISOString() }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
  if (path.endsWith('/orders/order/reversals')) data = { orderKind: 'SUBSCRIPTION', canCancel: true, canSelfRefund: true, usedCredits: 0, refundableCredits: 100, refundableAmount: '250.00', total: '250.00', currency: 'TRY', originalCredits: 100, hasPending: false, data: [] };
  await route.fulfill({ json: { success: true, data } });
 });
 await page.goto('/customer/agreements?view=orders');
 await page.getByRole('button', { name: 'Ödemeyi İptal Et', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Ödeme İptalini Onayla', exact: true })).toBeVisible();
 await expect(page.getByRole('button', { name: 'İade Talebini Gönder', exact: true })).toHaveCount(0);
});
