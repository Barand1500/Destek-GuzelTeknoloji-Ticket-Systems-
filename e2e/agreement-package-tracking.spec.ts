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
  await dialog.getByRole('textbox',{name:'Anlaşma dönem tutarı'}).fill('1250,50');
  const toggle = dialog.getByRole('checkbox', { name: /Dönem sonunda tekrarla/ });
  await expect(toggle).not.toBeChecked();
  await dialog.locator('.agreement-renewal-toggle').click();
  await expect(dialog.getByText('Anlaşmanın kendi tutarı ve dönemiyle yenilenir. Tahsilat için müşteri onayı ve ödeme bağlantısı gerekir.', { exact: true })).toBeVisible();
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

test('customer credit history opens as a page and survives reload', async ({page}) => {
 await setup(page,'CUSTOMER');
 await page.goto('/customer/agreements');
 await page.getByRole('button',{name:'Kredi Hareketleri',exact:true}).click();
 await expect(page).toHaveURL(/view=history/);
 await expect(page.getByRole('table',{name:'Kredi Hareketleri',exact:true})).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('table',{name:'Kredi Hareketleri',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Anlaşmalara Dön',exact:true}).click();
 await expect(page).toHaveURL(/view=agreements/);
 await expect(page.locator('.agreement-card')).toBeVisible();
 await page.goBack();
 await expect(page.getByRole('table',{name:'Kredi Hareketleri',exact:true})).toBeVisible();
});
test('staff customer management keeps credit history inside its modal',async({page})=>{
 await setup(page,'ADMIN');
 await page.goto('/admin/customers');
 await page.getByRole('button',{name:'Paket Firması yönetimi',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Kredi Hareketleri',exact:true}).click();
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('table',{name:'Kredi Hareketleri',exact:true})).toBeVisible();
});

test('credit history loads pages beyond the first hundred records', async ({ page }) => {
  await setup(page, 'CUSTOMER');
  const requested: number[] = [];
  await page.route('**/api/v1/customers/*/agreements/credit-history?*', route => {
    const url = new URL(route.request().url());
    const current = Number(url.searchParams.get('page'));
    expect(url.searchParams.get('limit')).toBe('20');
    requested.push(current);
    const data = Array.from({ length: Math.min(20, 125 - (current - 1) * 20) }, (_, i) => {
      const number = (current - 1) * 20 + i + 1;
      return { id: String(number), credits: 1, createdAt: '2026-11-18T10:00:00Z', agreement: null, conversation: { id: String(number), number, subject: 'History ' + number, customer: { name: 'Paket Firması' } } };
    });
    return route.fulfill({ json: { success: true, data, pagination: { page: current, limit: 20, total: 125, totalPages: 7 } } });
  });
  await page.goto('/customer/agreements?view=history');
  await expect(page.getByText('125 kullanım', { exact: true })).toBeVisible();
  for (let current = 1; current < 7; current++) {
    await expect(page.locator('.credit-log tbody tr')).toHaveCount(20);
    await page.getByRole('button', { name: 'Sonraki', exact: true }).click();
    await expect(page.locator('.credit-log nav span')).toHaveText((current + 1) + ' / 7');
  }
  await expect(page.getByText('History 125', { exact: true })).toBeVisible();
  await expect(page.locator('.credit-log tbody tr')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Sonraki', exact: true })).toBeDisabled();
  expect(requested).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test('customer sees subscription terms and must confirm recurring consent before acceptance', async ({ page }) => {
  await setup(page, 'CUSTOMER');
  let status = 'AWAITING_CONSENT';
  const actions: string[] = [];
  await page.route('**/api/v1/my/credit-store/subscriptions**', route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST') {
      actions.push(path.split('/').pop()!);
      status = path.endsWith('/accept') ? 'AWAITING_PAYMENT' : 'STOPPED';
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: { success: true, data: [{ id: 'sub', name: 'Üç Aylık Destek', amount: '1250.50', currency: 'TRY', credits: 300, periodMonths: 3, periodDays: null, autoRenew: status === 'AWAITING_PAYMENT', status, nextPaymentOn: '2026-12-01', currentEndsOn: '2026-11-30', customer: { name: 'Paket Firması', company: null } }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
  });
  await page.goto('/customer/agreements');
  await page.getByRole('button', { name: 'Aboneliklerim', exact: true }).click();
  await expect(page).toHaveURL(/view=subscriptions/);
  await expect(page.getByRole('cell', { name: '01.12.2026', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '₺1.250,50', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Koşulları Onayla', exact: true }).click();
  const confirm = page.getByRole('region', { name: 'Yenileme onayı' });
  await expect(confirm.getByRole('button', { name: 'Onayla', exact: true })).toBeDisabled();
  await confirm.locator('.integration-toggle').click();
  await expect(confirm.getByRole('checkbox')).toBeChecked();
  await confirm.getByRole('button', { name: 'Onayla', exact: true }).click();
  await expect.poll(() => actions).toEqual(['accept']);
  await expect(page.getByText('İlk ödeme bekliyor', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Yenilemeyi Kapat', exact: true }).click();
  await confirm.getByRole('button', { name: 'Yenilemeyi Kapat', exact: true }).click();
  await expect.poll(() => actions).toEqual(['accept', 'stop']);
  await expect(page.getByRole('cell', { name: 'Yenileme kapalı', exact: true })).toBeVisible();
});
test('agreement renewal uses its own price currency and period without a separate offer screen', async ({ page }) => {
  const writes = await setup(page, 'ADMIN');
  await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Paket Firması yönetimi', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Dönemsel Ödeme Ayarla', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Destek Paketi anlaşmasını düzenle', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Anlaşma dönem tutarı' }).fill('1250,50');
  await dialog.getByRole('button', { name: 'Anlaşma para birimi' }).click();
  await dialog.getByRole('option', { name: /Euro/ }).click();
  await dialog.getByRole('button', { name: 'Değişiklikleri Kaydet', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].fee).toBe('1250.50');
  expect(writes[0].currency).toBe('EUR');
});
