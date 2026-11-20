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
    if (path === `/customers/${customerId}`) return send(customer);
    if (path === `/customers/${customerId}/relations`) return send({customer, children: []});
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

test('staff create and edit agreements without renewal preferences', async ({ page }) => {
  const writes = await setup(page, 'ADMIN');
  await page.goto('/admin/customers');
  await page.locator('.customer-list-table tbody tr').first().click();
  await page.getByRole('button', { name: 'Anlaşmalar ve Krediler', exact: true }).click();
  const dialog = page.locator('.customer-management-page');
  await dialog.getByRole('button', { name: '+ Anlaşma Ekle', exact: true }).click();
  await dialog.getByLabel('Anlaşma Adı', { exact: true }).fill('Yeni paket');
  await dialog.getByLabel('Başlangıç Tarihi', { exact: true }).fill('2026-11-17');
  await dialog.getByLabel('Kredi Miktarı').fill('10');
  await dialog.getByRole('textbox',{name:'Anlaşma dönem tutarı'}).fill('1250,50');
  const toggle = dialog.getByRole('checkbox', { name: /Dönem sonunda tekrarla/ });
  await expect(toggle).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Anlaşmayı Kaydet', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].renewalRequested).toBeUndefined();
  await dialog.getByRole('button', { name: 'Destek Paketi anlaşmasını düzenle', exact: true }).click();
  await expect(toggle).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Değişiklikleri Kaydet', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].renewalRequested).toBeUndefined();
});

test('customer credit history opens as a page and survives reload', async ({page}) => {
 await setup(page,'CUSTOMER');
 await page.goto('/customer/agreements');
 await page.getByRole('tab',{name:'Kredi Hareketleri',exact:true}).click();
 await expect(page).toHaveURL(/view=history/);
 await expect(page.getByRole('table',{name:'Kredi Hareketleri',exact:true})).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('table',{name:'Kredi Hareketleri',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Anlaşmalarım',exact:true}).click();
 await expect(page).toHaveURL(/view=agreements/);
 await expect(page.locator('.agreement-card')).toBeVisible();
 await page.goBack();
 await expect(page.getByRole('table',{name:'Kredi Hareketleri',exact:true})).toBeVisible();
});
test('staff customer management keeps credit history inside its company section',async({page})=>{
 await setup(page,'ADMIN');
 await page.goto('/admin/customers');
 await page.locator('.customer-list-table tbody tr').first().click();
 const dialog=page.locator('.customer-management-page');
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

test('customer sees package history without recurring enrollment controls', async ({ page }) => {
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
  await page.getByRole('tab', { name: 'Siparişlerim ve Aboneliklerim', exact: true }).click();
  await page.getByRole('tab', { name: 'Aboneliklerim', exact: true }).click();
  await expect(page).toHaveURL(/view=subscriptions/);
  await expect(page.getByRole('cell', { name: '01.12.2026', exact: true })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: '₺1.250,50', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Koşulları Onayla|Yenilemeyi Kapat|Ödemeye Geç/ })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Planlanan yenileme' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Siparişler', exact: true })).toBeVisible();
  expect(actions).toEqual([]);
});
test('agreement renewal uses its own price currency and period without a separate offer screen', async ({ page }) => {
  const writes = await setup(page, 'ADMIN');
  await page.goto('/admin/customers');
  await page.locator('.customer-list-table tbody tr').first().click();
  await page.getByRole('button', { name: 'Anlaşmalar ve Krediler', exact: true }).click();
  const dialog = page.locator('.customer-management-page');
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

test('package badges reflect paid dates and refunds instead of retired recurring status', async ({ page }) => {
  await setup(page, 'CUSTOMER');
  const cases = [
    { id: 'active', name: 'Aktif paket', lastOrderStatus: 'PAID', currentEndsOn: '2099-12-31', label: 'Aktif', badge: 'active' },
    { id: 'refunded', name: 'İade paketi', lastOrderStatus: 'REFUNDED', currentEndsOn: '2099-12-31', label: 'İade edildi', badge: 'refunded' },
    { id: 'partial', name: 'Kısmi paket', lastOrderStatus: 'PARTIAL_REFUND', currentEndsOn: '2099-12-31', label: 'Kısmi iade', badge: 'partial_refund' },
    { id: 'cancelled', name: 'İptal paketi', lastOrderStatus: 'CANCELLED', currentEndsOn: null, label: 'İptal edildi', badge: 'cancelled' },
    { id: 'failed', name: 'Başarısız paket', lastOrderStatus: 'FAILED', currentEndsOn: null, label: 'Ödeme alınamadı', badge: 'failed' },
  ];
  await page.route('**/api/v1/my/credit-store/subscriptions**', route => route.fulfill({ json: {
    success: true, data: cases.map(row => ({ ...row, amount: '100', currency: 'TRY', credits: 100, periodMonths: 1, periodDays: null, status: 'STOPPED', currentStartsOn: '2026-01-01', customer: { name: 'Paket Firması', company: null } })),
    pagination: { page: 1, limit: 20, total: cases.length, totalPages: 1 },
  } }));
  await page.goto('/customer/agreements?view=subscriptions');
  for (const item of cases) {
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: new RegExp(item.name) }) });
    const badge = row.locator('.credit-order-status');
    await expect(badge).toHaveText(item.label);
    await expect(badge).toHaveClass(new RegExp('credit-order-status-' + item.badge));
  }
});
