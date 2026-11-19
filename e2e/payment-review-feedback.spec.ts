import { test, expect } from '@playwright/test';

test('payment inquiry shows its result even when payment remains pending', async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } };
    if (path.endsWith('/payment-settings')) data = { provider: 'iyzico', enabled: false, recurringEnabled: false, mode: 'sandbox', publicUrl: '', credentialsConfigured: false, testedAt: null, lastError: null };
    if (path.endsWith('/payment-settings/akbank')) data = { mode: 'sandbox', enabled: false, publicUrl: '', credentialsConfigured: false, testedAt: null, lastError: null };
    if (path.endsWith('/payment-settings/pending')) data = { total: 1, data: [{ id: 'attempt', createdAt: '2026-01-01T00:00:00Z', order: { number: 3, name: 'Ek kredi', total: '1.00', currency: 'TRY' } }] };
    if (path.endsWith('/pending/attempt/check')) data = { message: 'Banka sorgulandı; ödeme sonucu henüz kesinleşmedi.' };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/settings/payments');
  await page.getByRole('button', { name: 'Sonucu Sorgula', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Banka sorgulandı; ödeme sonucu henüz kesinleşmedi.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sonucu Sorgula', exact: true })).toBeEnabled();
});
