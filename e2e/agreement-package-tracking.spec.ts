import { test, expect, type Page } from '@playwright/test';

const customerId = 'd4bdfe56-9948-4ed2-942e-e44d76354186';
async function setup(page: Page, role: 'ADMIN' | 'CUSTOMER') {
  const customer = { id: customerId, name: 'Paket Firması', role: 'CUSTOMER', isActive: true };
  const agreement = { id: 'agreement', customerId, customer, name: 'Destek Paketi', type: 'ONE_OFF', startsOn: '2026-01-01', endsOn: '2027-12-31', credits: 20, usedCredits: 20, remainingCredits: 0, usable: false, state: 'DEPLETED', renewalRequested: true };
  const writes: Record<string, unknown>[] = [];
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const send = (data: unknown) => route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 1, totalPages: 1, limit: 15 } } });
    if (path === '/auth/refresh') return send({ accessToken: 'test', user: role === 'CUSTOMER' ? customer : { id: 'staff', name: 'Yönetici', role } });
    if (path === '/customers') return send([customer]);
    if (path === `/customers/${customerId}/agreements`) {
      if (route.request().method() === 'POST') writes.push(route.request().postDataJSON());
      return send({ customer, parent: null, children: [], agreements: [agreement], availableCredits: 0, charges: [] });
    }
    if (path === `/customers/${customerId}/agreements/agreement`) {
      writes.push(route.request().postDataJSON());
      return send(agreement);
    }
    if (path === '/auth/security') return send({ enabled: false });
    if (path === '/staff-presence') return send({ staff: [], idleMinutes: 5 });
    return send([]);
  });
  return writes;
}

test('customer sees dates, usage and depleted state without expanding package', async ({ page }) => {
  await setup(page, 'CUSTOMER');
  await page.goto('/customer/agreements');
  const card = page.locator('.agreement-card');
  await expect(card).toBeVisible();
  await expect(card).not.toHaveAttribute('open');
  await expect(card.locator('summary')).toContainText('Başlangıç: 01.01.2026');
  await expect(card.locator('summary')).toContainText('Bitiş: 31.12.2027');
  await expect(card.locator('summary')).toContainText('Toplam: 20 · Kullanılan: 20 · Kalan: 0');
  await expect(card.locator('summary')).toContainText('Kredi Tükendi');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('staff create and edit persist renewal preference with clear helper', async ({ page }) => {
  const writes = await setup(page, 'ADMIN');
  await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Paket Firması yönetimi', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '+ Anlaşma Ekle', exact: true }).click();
  await dialog.getByLabel('Anlaşma Adı', { exact: true }).fill('Yeni paket');
  await dialog.getByLabel('Başlangıç Tarihi', { exact: true }).fill('2026-11-17');
  await dialog.getByLabel('Kredi Miktarı').fill('10');
  const toggle = dialog.getByRole('checkbox', { name: /Dönem sonunda tekrarla/ });
  await expect(toggle).not.toBeChecked();
  await dialog.locator('.agreement-renewal-toggle').click();
  await expect(dialog.getByText('Yenileme tercihi kaydedilir. Otomatik yenileme ve tahsilat henüz etkin değil.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Anlaşmayı Kaydet', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].renewalRequested).toBe(true);
  await dialog.getByRole('button', { name: 'Destek Paketi anlaşmasını düzenle', exact: true }).click();
  await expect(toggle).toBeChecked();
  await dialog.locator('.agreement-renewal-toggle').click();
  await dialog.getByRole('button', { name: 'Değişiklikleri Kaydet', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].renewalRequested).toBe(false);
});
