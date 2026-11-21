import { test, expect } from '@playwright/test';

test('admin reviews credit-based refund, confirms amount and sees customer-facing refund state', async ({ page }) => {
  let order: any = { id: 'paid-order', number: 42, name: 'Destek paketi', kind: 'TOP_UP', refundRequest: { status: 'OPEN' }, status: 'PAID', paidAt: new Date().toISOString(), total: '101.01', credits: 100, currency: 'TRY', unitPrice: null, validityDays: 365, periodMonths: null, createdAt: new Date().toISOString(), customer: { id: 'customer', name: 'Customer' }, reversals: [] };
  let summary: any = { refundRequest: { status: 'OPEN', reason: 'Please refund unused credits' }, data: [], currency: 'TRY', refundableCredits: 100, refundableAmount: '101.01', originalCredits: 100, total: '101.01', refundedCredits: 0, refundedAmount: '0.00', hasPending: false, usedCredits: 0, canCancel: true };
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
        order = { ...order, refundRequest: { status: 'RESOLVED' }, status: 'PARTIAL_REFUND', reversals: [row] };
        summary = { ...summary, refundRequest: { status: 'RESOLVED' }, data: [row], refundableCredits: 75, refundableAmount: '75.76', refundedCredits: 25, refundedAmount: '25.25', canCancel: false };
        data = row;
      } else data = summary;
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/credit-sales?view=orders');
  await page.getByRole('button', { name: 'İade Talebini İncele', exact: true }).click();
  const panel = page.getByRole('region', { name: 'İade ve banka iptali' });
  await expect(panel.locator('.reversal-order-summary > div').filter({ hasText: 'Kalan kullanılabilir kredi' })).toContainText('100');
  await expect(page.getByRole('button', { name: 'Banka İptali', exact: true })).toHaveCount(0);
  await expect(panel.getByLabel('İade edilecek kredi *')).toHaveValue('100');
  await panel.getByLabel('İade edilecek kredi *').fill('101');
  await expect(panel.getByRole('alert')).toContainText('En fazla 100 kredi');
  await expect(panel.getByRole('button', { name: 'İadeyi Onayla' })).toBeDisabled();
  await panel.getByLabel('İade edilecek kredi *').fill('25');
  await panel.getByLabel('İade nedeni *').fill('Müşteri talebiyle kısmi iade');
  await expect(panel.getByRole('textbox', { name: 'İade edilecek tutar', exact: true })).toHaveValue('25,25');
  await expect(panel.getByRole('button', { name: 'İadeyi Onayla' })).toBeDisabled();
  await panel.locator('.credit-confirmation-choice span').click();
  await panel.getByRole('button', { name: 'İadeyi Onayla' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].credits).toBe(25);
  expect(writes[0].kind).toBe('REFUND');
  expect(writes[0].requestKey).toMatch(/^[a-f0-9-]{36}$/);
  await expect(page.getByText('Kısmen iade edildi', { exact: true })).toBeVisible();
  await expect(panel.locator('.reversal-order-summary > div').filter({ hasText: 'Kalan kullanılabilir kredi' })).toContainText('75');
});

test('used credit offers only refund and order requests can be rejected without a bank operation', async ({ page }) => {
 let open = true, bankWrites = 0;
 await page.route('**/api/v1/**', async route => {
  const url = new URL(route.request().url()); let data: any = [];
  if (url.pathname.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } };
  if (url.pathname.endsWith('/credit-sales')) data = { settings: { enabled: true, currency: 'TRY', unitPrice: '1.00', minCredits: 1, maxCredits: 10000, validityDays: 365 }, plans: [] };
  if (url.pathname.endsWith('/credit-sales/orders')) return route.fulfill({ json: { success: true, data: [{ id: 'used-order', number: 18, kind: 'TOP_UP', name: 'Used package', credits: 100, usedCredits: 10, canBankCancel: false, total: '1.00', currency: 'TRY', status: 'PAID', createdAt: new Date().toISOString(), paidAt: new Date().toISOString(), refundRequest: { status: open ? 'OPEN' : 'REJECTED' } }], pagination: { total: 1, page: 1, limit: 20, totalPages: 1 } } });
  if (url.pathname.endsWith('/used-order/reversals')) { if (route.request().method() === 'POST') bankWrites++; data = { refundRequest: { status: open ? 'OPEN' : 'REJECTED', reason: 'Please refund remaining credit' }, data: [], currency: 'TRY', refundableCredits: 90, refundableAmount: '0.90', originalCredits: 100, total: '1.00', refundedCredits: 0, refundedAmount: '0', hasPending: false, usedCredits: 10, canCancel: false }; }
  if (url.pathname.endsWith('/refund-request/reject')) { expect(route.request().postDataJSON()).toEqual({ reason: 'Customer request reviewed' }); open = false; data = { success: true }; }
  await route.fulfill({ json: { success: true, data } });
 });
 await page.goto('/admin/credit-sales?view=orders');
 await expect(page.getByRole('button', { name: 'Banka İptali', exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: 'İade Talebini İncele' }).click();
 const panel = page.getByRole('region', { name: 'İade ve banka iptali' });
 await expect(panel.getByLabel('İade edilecek kredi')).toHaveValue('90');
 await panel.getByLabel('İade edilecek kredi').fill('50');
 await expect(panel.getByLabel('İade edilecek kredi')).toHaveValue('50');
 await panel.getByLabel('Ret gerekçesi').fill('Customer request reviewed');
 await panel.getByRole('button', { name: 'Talebi Reddet' }).click();
 await expect(page.getByText('İade talebi bekliyor', { exact: true })).toHaveCount(0);
 expect(bankWrites).toBe(0);
});

test('admin defaults to unused value and can raise refund only to remaining paid amount', async ({ page }) => {
 const writes: any[] = [];
 await page.route('**/api/v1/**', async route => {
  const path = new URL(route.request().url()).pathname;
  let data: any = [];
  if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } };
  if (path.endsWith('/credit-sales')) data = { settings: { enabled: true, currency: 'TRY', unitPrice: '1', minCredits: 1, maxCredits: 10000, validityDays: 365 }, plans: [] };
  if (path.endsWith('/payment-settings/pending')) data = { total: 0, data: [] };
  if (path.endsWith('/credit-sales/orders')) return route.fulfill({ json: { success: true, data: [{ id: 'used-order', number: 42, name: 'Used package', kind: 'SUBSCRIPTION', status: 'PAID', total: '1000.00', credits: 100, usedCredits: 30, currency: 'TRY', createdAt: new Date().toISOString(), customer: { name: 'Customer' } }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
  if (path.endsWith('/used-order/reversals')) {
   if (route.request().method() === 'POST') { writes.push(route.request().postDataJSON()); data = { status: 'SUCCEEDED' }; }
   else data = { orderName: 'Example package', orderNumber: 42, data: [], currency: 'TRY', refundableCredits: 70, refundableAmount: '700.00', maxRefundAmount: '1000.00', originalCredits: 100, total: '1000.00', refundedCredits: 0, refundedAmount: '0.00', hasPending: false, usedCredits: 30, canCancel: false };
  }
  await route.fulfill({ json: { success: true, data } });
 });
 await page.goto('/admin/credit-sales?view=orders');
 await page.getByRole('button', { name: 'İade Et', exact: true }).click();
 const panel = page.getByRole('region', { name: 'İade ve banka iptali' });
 await expect(panel.getByLabel('İade edilecek kredi *')).toHaveValue('70');
 await expect(panel.locator('.reversal-order-summary')).toContainText('Example package');
 await expect(panel.locator('.reversal-edit-fields small')).toHaveCount(0);
 await expect(panel.getByRole('note')).toBeVisible();
 await page.screenshot({ path: 'output/refund-panel-layout.png', fullPage: true });
 await expect(panel.getByRole('textbox', { name: 'İade edilecek tutar', exact: true })).toHaveValue('700,00');
 await panel.getByLabel('İade nedeni *').fill('Manager approved full refund');
 const amount = panel.getByRole('textbox', { name: 'İade edilecek tutar', exact: true });
 await amount.click();
 await amount.fill('1001');
 await panel.locator('.credit-confirmation-choice span').click();
 await expect(panel.getByRole('button', { name: 'İadeyi Onayla' })).toBeDisabled();
 await amount.click();
 await amount.fill('1000');
 await panel.locator('.credit-confirmation-choice span').click();
 await panel.getByRole('button', { name: 'İadeyi Onayla' }).click();
 await expect.poll(() => writes.length).toBe(1);
 expect(writes[0]).toMatchObject({ kind: 'REFUND', credits: 70, amount: '1000' });
});
