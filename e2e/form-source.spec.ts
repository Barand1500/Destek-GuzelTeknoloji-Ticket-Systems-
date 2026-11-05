import { test, expect } from '@playwright/test';

test('Source settings have a compact add button and save below all settings', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('helpdesk-theme', 'dark'));
  await page.route('**/socket.io/**', route => route.abort());
  let creates = 0, saves = 0;
  const sources: { id: string; name: string; url: string; enabled: boolean }[] = [];
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const send = (data: unknown) => route.fulfill({ json: { success: true, data, pagination: { total: 0, totalPages: 1 }, unreadCount: 0 } });
    if (path === '/auth/refresh') return send({ accessToken: 'preview', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } });
    if (path === '/integrations/form/sources') {
      if (route.request().method() === 'POST') { creates++; sources.push({ id: '164b3d21-5597-4d50-953e-ec668092e952', ...route.request().postDataJSON(), enabled: true }); }
      return send(sources);
    }
    if (path.startsWith('/integrations/form/sources/')) {
      if (route.request().method() === 'PATCH') sources[0].enabled = route.request().postDataJSON().enabled;
      if (route.request().method() === 'DELETE') sources.splice(0, 1);
      return send({});
    }
    if (path === '/integrations/form') {
      if (route.request().method() === 'PUT') saves++;
      return send({ title: 'Destek Talebi', enabled: true, departmentId: null });
    }
    if (path === '/integrations' || path === '/notification-settings') return send({});
    if (path === '/auth/security') return send({ enabled: false });
    if (path === '/staff-presence') return send({ staff: [], idleMinutes: 5 });
    return send([]);
  });
  await page.goto('/admin/integrations/channels');
  await page.getByRole('tab', { name: 'Form', exact: true }).click();
  const add = page.getByRole('button', { name: 'Site Ekle', exact: true });
  const save = page.getByRole('button', { name: 'Kaydet', exact: true }).filter({ visible: true });
  await expect(add).toBeVisible();
  const box = (await add.boundingBox())!;
  expect(box.width).toBeLessThan(180);
  expect(box.height).toBeLessThan(60);
  expect((await save.boundingBox())!.y).toBeGreaterThan(box.y + box.height);
  await expect(page.locator('form form')).toHaveCount(0);
  await page.getByLabel('Site Adı', { exact: true }).fill('Yeni Site');
  await page.getByLabel('Site Adresi', { exact: true }).fill('https://example.com');
  await add.click();
  const accordion = page.locator('.form-source-accordion');
  await expect(accordion).not.toHaveAttribute('open', '');
  const toggle = accordion.getByRole('switch');
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await expect(accordion).not.toHaveAttribute('open', '');
  await toggle.press('Space');
  await expect(toggle).toBeChecked();
  await expect(accordion).not.toHaveAttribute('open', '');
  await accordion.locator('summary').click();
  await expect(page.getByText('Siteye Özel iframe Kodu', { exact: true })).toBeVisible();
  const actions = accordion.locator('.form-source-actions');
  await expect(actions.getByRole('button', { name: 'Sil', exact: true })).toBeVisible();
  expect((await actions.getByRole('button', { name: 'Sil', exact: true }).boundingBox())!.y).toBe((await actions.getByRole('button', { name: 'iframe Kodunu Kopyala', exact: true }).boundingBox())!.y);
  expect(creates).toBe(1); expect(saves).toBe(0);
  await save.click();
  await expect(page.getByText('Form ayarları kaydedildi.', { exact: true })).toBeVisible();
  expect(saves).toBe(1);
  await page.screenshot({ path: '.local/form-settings-source-fixed.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(add).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await actions.getByRole('button', { name: 'Sil', exact: true }).click();
  await expect(accordion).toHaveCount(0);
  await expect(page.getByText('Henüz kaynak site tanımlanmadı.', { exact: true })).toBeVisible();
});

test('Embedded site source survives tracking toggle and is sent with the request', async ({ page }) => {
  const sourceId = '164b3d21-5597-4d50-953e-ec668092e952';
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/security')) return route.fulfill({ json: { success: true, data: { enabled: false, siteKey: null } } });
    if (path.endsWith('/public/form/settings')) return route.fulfill({ json: { success: true, data: { enabled: true, title: 'Destek Talebi' } } });
    return route.fulfill({ status: 401, json: { success: false } });
  });
  let submitted = '';
  await page.route('**/public/form/requests', route => {
    submitted = route.request().postData() ?? '';
    return route.fulfill({ status: 201, json: { success: true, data: { number: 456 } } });
  });
  await page.goto(`/form/destek?source=${sourceId}&embed=1`);
  await page.getByRole('button', { name: 'Mevcut Talebimi Takip Et', exact: true }).click();
  await page.getByRole('button', { name: 'Yeni Talep Aç', exact: true }).click();
  await page.locator('input[name=name]').fill('Site Müşterisi');
  await page.locator('input[name=email]').fill('customer@example.test');
  await page.locator('input[name=subject]').fill('Site talebi');
  await page.locator('textarea[name=message]').fill('Kaynak testi');
  await page.screenshot({ path: '.local/form-source-embedded.png', fullPage: true });
  await page.getByRole('button', { name: 'Talebi Gönder', exact: true }).click();
  await expect(page.getByText('Talebiniz alındı.', { exact: true })).toBeVisible();
  expect(submitted).toContain('name="sourceId"');
  expect(submitted).toContain(sourceId);
});
