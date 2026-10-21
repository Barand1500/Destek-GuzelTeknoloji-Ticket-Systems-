import { test, expect } from '@playwright/test';

test('Cloudflare settings save independently, keep saved secrets private and persist on reload', async ({ page }) => {
  let settings = { enabled: false, siteKey: '', secretConfigured: false, secretLength: 0 };
  const writes: Record<string, unknown>[] = [];
  let unrelatedWrites = 0;
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { data: { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } } } });
    if (path === '/integrations/turnstile/secret') return route.fulfill({ json: { data: { secretKey: 'private-panel-key' } } });
    if (path === '/integrations/turnstile') {
      if (route.request().method() === 'PUT') {
        const input = route.request().postDataJSON(); writes.push(input);
        if (input.enabled && !settings.secretConfigured && !input.secretKey) return route.fulfill({ status: 400, json: { error: { message: 'Cloudflare için Site Key ve Secret Key girin.' } } });
        settings = { enabled: input.enabled, siteKey: input.siteKey, secretConfigured: settings.secretConfigured || Boolean(input.secretKey), secretLength: input.secretKey ? input.secretKey.length : settings.secretLength };
      }
      return route.fulfill({ json: { success: true, data: settings } });
    }
    if (route.request().method() !== 'GET') unrelatedWrites++;
    if (path === '/integrations') return route.fulfill({ json: { data: { smtpEnabled: true } } });
    if (path === '/notification-settings') return route.fulfill({ json: { data: { ticketCreatedSubject: 'Created', ticketCreatedBody: 'Created', ticketReplySubject: 'Reply', ticketReplyBody: 'Reply' } } });
    return route.fulfill({ json: { success: true, data: [], pagination: { page: 1, total: 0, totalPages: 1 } } });
  });
  await page.goto('/admin/integrations/channels');
  await page.getByRole('tab', { name: 'Cloudflare', exact: true }).click();
  await page.getByLabel('Doğrulamayı Etkinleştir', { exact: true }).check();
  const site = page.getByLabel('Site Key', { exact: true });
  const secret = page.getByLabel('Secret Key', { exact: true });
  await expect(secret).toHaveValue('');
  await site.fill('public-site-key');
  const save = page.getByRole('button', { name: 'Kaydet', exact: true });
  await save.click();
  await expect(page.getByRole('alert')).toContainText('Site Key ve Secret Key');
  await secret.fill('private-panel-key');
  await save.click();
  await expect(page.getByRole('status')).toContainText('Cloudflare ayarları kaydedildi.');
  await expect(secret).toHaveValue('*'.repeat('private-panel-key'.length));
  await expect(secret).not.toHaveAttribute('placeholder');
  expect(writes.at(-1)).toEqual({ enabled: true, siteKey: 'public-site-key', secretKey: 'private-panel-key' });
  const card = page.getByRole('region', { name: 'Cloudflare Ayarları' });
  expect((await save.boundingBox())!.y).toBeGreaterThanOrEqual((await card.boundingBox())!.y + (await card.boundingBox())!.height);
  await page.screenshot({ path: '.local/cloudflare-settings.png', fullPage: true });
  await page.reload();
  await page.getByRole('tab', { name: 'Cloudflare', exact: true }).click();
  await expect(site).toHaveValue('public-site-key');
  await expect(secret).toHaveValue('*'.repeat('private-panel-key'.length));
  await expect(page.getByLabel('Doğrulamayı Etkinleştir', { exact: true })).toBeChecked();
  await save.click();
  await expect(page.getByRole('status')).toContainText('Cloudflare ayarları kaydedildi.');
  expect(writes.at(-1)).toEqual({ enabled: true, siteKey: 'public-site-key' });
  await page.getByRole('button', { name: 'Gizli Anahtarı Göster', exact: true }).click();
  await expect(secret).toHaveValue('private-panel-key');
  await expect(secret).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Gizli Anahtarı Gizle', exact: true }).click();
  await expect(secret).toHaveAttribute('type', 'password');
  await page.getByLabel('Doğrulamayı Etkinleştir', { exact: true }).uncheck();
  await save.click();
  await expect.poll(() => settings.enabled).toBe(false);
  expect(unrelatedWrites).toBe(0);
});
