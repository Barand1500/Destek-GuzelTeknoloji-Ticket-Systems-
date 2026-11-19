import { test, expect } from '@playwright/test';

test('payment inquiry shows its result even when payment remains pending', async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path.endsWith('/credit-sales')) data = { settings: { currency: 'TRY', unitPrice: '1', enabled: true }, plans: [] };
    if (path.endsWith('/credit-sales/orders')) return route.fulfill({ json: { success: true, data: [{ id: 'order', number: 3, name: 'Ek kredi', kind: 'TOP_UP', credits: 1, total: '1.00', currency: 'TRY', status: 'PENDING', paymentInProgress: true, createdAt: '2026-01-01T00:00:00Z', customer: { name: 'Customer' } }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } };
    if (path.endsWith('/payment-settings')) data = { provider: 'iyzico', enabled: false, recurringEnabled: false, mode: 'sandbox', publicUrl: '', credentialsConfigured: false, testedAt: null, lastError: null };
    if (path.endsWith('/payment-settings/akbank')) data = { mode: 'sandbox', enabled: false, publicUrl: '', credentialsConfigured: false, testedAt: null, lastError: null };
    if (path.endsWith('/payment-settings/pending')) data = { total: 1, data: [{ id: 'attempt', createdAt: '2026-01-01T00:00:00Z', order: { number: 3, name: 'Ek kredi', total: '1.00', currency: 'TRY' } }] };
    if (path.endsWith('/pending/attempt/check')) data = { message: 'Banka sorgulandı; ödeme sonucu henüz kesinleşmedi.' };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/credit-sales?view=orders');
  await page.getByRole('button', { name: 'Ödeme Kontrolü', exact: true }).click();
  await page.getByRole('button', { name: 'Sonucu Sorgula', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Banka sorgulandı; ödeme sonucu henüz kesinleşmedi.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sonucu Sorgula', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Tahsilat Yok Doğrulaması', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Tahsilat yok doğrulaması' });
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      const copy = await panel.locator(':scope > p').boundingBox();
      const input = await panel.getByRole('textbox').boundingBox();
      expect(input!.y - copy!.y - copy!.height).toBeGreaterThanOrEqual(16);
      const toggle = await panel.getByRole('switch').locator('..').boundingBox();
      expect(toggle!.width).toBeLessThan(350);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await panel.screenshot({ path: `.local/payment-recovery-${theme}-${width}.png` });
    }
  }
  await panel.getByRole('textbox').fill('Bank support reference fixture');
  await panel.getByText('Tahsilat yapılmadığını doğruladım', { exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Doğrulamayı Kaydet' })).toBeEnabled();
});
