import { test, expect } from '@playwright/test';

test('admin saves masked payment keys, tests connection and enables payments', async ({ page }) => {
  let current: any = { provider: 'iyzico', enabled: false, recurringEnabled: false, mode: 'sandbox', publicUrl: 'https://support.example.test', credentialsConfigured: false, testedAt: null, lastError: null };
  const writes: any[] = [];
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'admin', name: 'Test Admin', role: 'ADMIN' } };
    if (path.endsWith('/credit-sales')) data = { settings: { enabled: true, currency: 'TRY', unitPrice: '2.50', minCredits: 1, maxCredits: 10000, validityDays: 365 }, plans: [] };
    if (path.endsWith('/payment-settings')) {
      if (route.request().method() === 'PUT') { const input = route.request().postDataJSON(); writes.push(input); current = { ...current, ...input, credentialsConfigured: true }; delete current.apiKey; delete current.secretKey; }
      data = current;
    }
    if (path.endsWith('/payment-settings/test')) { current.testedAt = new Date().toISOString(); data = current; }
    if (path.endsWith('/payment-settings/pending')) data = { total: 0, data: [] };
    if (path.endsWith('/payment-settings/akbank')) data = { mode: 'sandbox', credentialsConfigured: false, enabled: false, publicUrl: 'https://support.example.test', testedAt: null, lastError: null };
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/admin/settings/payments');
  const panel = page.getByRole('region', { name: 'Ödeme Ayarları' });
  await expect(panel.getByRole('switch', { name: 'Online ödeme', exact: true })).toBeDisabled();
  await panel.getByLabel('API anahtarı', { exact: true }).fill('test-api-key');
  await panel.getByLabel('Gizli anahtar', { exact: true }).fill('test-secret-key');
  await panel.getByRole('button', { name: 'Ödeme Ayarlarını Kaydet' }).click();
  await expect(panel.getByLabel('API anahtarı', { exact: true })).toHaveValue('');
  await expect(panel.getByLabel('Gizli anahtar', { exact: true })).toHaveValue('');
  await panel.getByRole('button', { name: 'Bağlantıyı Test Et' }).click();
  await expect(panel.getByRole('switch', { name: 'Online ödeme', exact: true })).toBeEnabled();
  await panel.getByText('Online ödeme', { exact: true }).click();
  await panel.getByRole('button', { name: 'Ödeme Ayarlarını Kaydet' }).click();
  await expect(panel.getByRole('button', { name: 'Ödeme Ayarlarını Kaydet' })).toBeDisabled();
  expect(writes[0].secretKey).toBe('test-secret-key');
  expect(writes[1].enabled).toBe(true);
  expect(writes[1].secretKey).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'BIN Sorgulama' })).toHaveCount(0);
  await panel.screenshot({ path: 'test-results/payment-settings-light.png' });
  await page.getByRole('button', { name: 'Gece Moduna Geç' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await panel.screenshot({ path: 'test-results/payment-settings-dark.png' });
});
