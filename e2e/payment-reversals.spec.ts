import { test, expect } from '@playwright/test';

test('admin reviews credit-based refund, confirms amount and sees customer-facing refund state', async ({ page }) => {
  let order: any = { id: 'paid-order', number: 42, name: 'Destek paketi', kind: 'TOP_UP', status: 'PAID', total: '101.01', credits: 100, currency: 'TRY', unitPrice: null, validityDays: 365, periodMonths: null, createdAt: new Date().toISOString(), customer: { id: 'customer', name: 'Customer' }, reversals: [] };
  let summary: any = { data: [], currency: 'TRY', refundableCredits: 100, refundableAmount: '101.01', originalCredits: 100, total: '101.01', refundedCredits: 0, refundedAmount: '0.00', hasPending: false, usedCredits: 0, canCancel: true };
  const writes: any[] = [];
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } };
    if (path.endsWith('/credit-sales')) data = { settings: { enabled: true, currency: 'TRY', unitPrice: '1.00', minCredits: 1, maxCredits: 10000, validityDays: 365 }, plans: [] };
    if (path.endsWith('/payment-settings')) data = { provider: 'iyzico', enabled: false, recurringEnabled: false, mode: 'sandbox', publicUrl: 'https://example.test', credentialsConfigured: false, testedAt: null };
    if (path.endsWith('/payment-settings/pending')) data = { total: 0, data: [] };
    if (path.endsWith('/credit-sales/orders')) return route.fulfill({ json: { success: true, data: [order], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    if (path.endsWith('/paid-order/reversals')) {
      if (route.request().method() === 'POST') {
        const input = route.request().postDataJSON(); writes.push(input);
        const row = { id: 'refund-1', kind: input.kind, credits: input.credits, amount: '25.25', currency: 'TRY', reason: input.reason, status: 'SUCCEEDED', createdAt: new Date().toISOString() };
        order = { ...order, status: 'PARTIAL_REFUND', reversals: [row] };
        summary = { ...summary, data: [row], refundableCredits: 75, refundableAmount: '75.76', refundedCredits: 25, refundedAmount: '25.25', canCancel: false };
        data = row;
      } else data = summary;
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/credit-sales?view=orders');
  await page.getByRole('button', { name: 'İade / Banka İptali' }).click();
  const panel = page.getByRole('region', { name: 'İade ve banka iptali' });
  await expect(panel.getByText(/İade edilebilir: 100 kredi/)).toBeVisible();
  await panel.getByLabel('İade edilecek kredi *').fill('25');
  await panel.getByLabel('İade nedeni *').fill('Müşteri talebiyle kısmi iade');
  await expect(panel.getByText(/İade tutarı:.*25,25/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'İadeyi Onayla' })).toBeDisabled();
  await panel.locator('.credit-renewal-choice span').click();
  await panel.getByRole('button', { name: 'İadeyi Onayla' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].credits).toBe(25);
  expect(writes[0].kind).toBe('REFUND');
  expect(writes[0].requestKey).toMatch(/^[a-f0-9-]{36}$/);
  await expect(page.getByText('Kısmen iade edildi', { exact: true })).toBeVisible();
  await expect(panel.getByText(/İade edilebilir: 75 kredi/)).toBeVisible();
});
