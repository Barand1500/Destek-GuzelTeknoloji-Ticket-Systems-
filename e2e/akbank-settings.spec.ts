import { test, expect } from '@playwright/test';

test('Akbank setup saves credentials then clears and masks them without enabling payment', async ({ page }) => {
  let configured = false;
  const writes: any[] = [];
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } };
    if (path.endsWith('/payment-settings/akbank')) {
      if (route.request().method() === 'PUT') { writes.push(route.request().postDataJSON()); configured = true; }
      data = { mode: 'sandbox', credentialsConfigured: configured, enabled: false, recurringEnabled: false, publicUrl: 'https://portal.test', testedAt: null, paymentAvailable: false };
    }
    if (path.endsWith('/payment-settings')) data = { enabled: false, recurringEnabled: false, mode: 'sandbox', publicUrl: '', credentialsConfigured: false, testedAt: null };
    if (path.endsWith('/payment-settings/pending')) data = { total: 0, data: [] };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/settings/payments');
  const panel = page.getByRole('region', { name: 'Akbank Sanal POS', exact: true });
  await expect(panel.getByRole('button', { name: 'Akbank ortamı' })).toContainText('Test ortamı');
  const heading = await panel.getByRole('heading', { name: 'Akbank Sanal POS' }).boundingBox();
  const toggle = await panel.getByRole('switch', { name: 'Akbank online ödeme' }).locator('..').boundingBox();
  expect(Math.abs(heading!.y - toggle!.y)).toBeLessThan(35);
  await panel.getByLabel('İşyeri kimliği (Merchant Safe ID)').fill('fixture-merchant');
  await panel.getByLabel('Terminal Safe ID').fill('fixture-terminal');
  await panel.getByLabel('Güvenlik anahtarı').fill('fixture-secret');
  await panel.getByRole('button', { name: 'Akbank Bilgilerini Kaydet' }).click();
  await expect(panel.getByRole('status')).toContainText('Akbank ayarları kaydedildi');
  await expect(panel.getByLabel('Güvenlik anahtarı')).toHaveValue('');
  await expect(panel.getByLabel('Terminal Safe ID')).toHaveValue('');
  expect(writes).toEqual([{ mode: 'sandbox', enabled: false, recurringEnabled: false, publicUrl: 'https://portal.test', merchantSafeId: 'fixture-merchant', terminalSafeId: 'fixture-terminal', secretKey: 'fixture-secret' }]);
  await expect(panel.getByRole('switch', { name: 'Akbank online ödeme' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Akbank ortamı' }).click();
  await panel.getByRole('option', { name: 'Canlı ortam', exact: true }).click();
  await expect(panel.getByLabel('Güvenlik anahtarı')).toHaveAttribute('required', '');
  await expect(panel.getByRole('switch', { name: 'Akbank online ödeme' })).toBeDisabled();
  await expect(panel.getByText('Seçtiğiniz ortama ait üç bilgiyi yeniden girin.')).toBeVisible();
});
