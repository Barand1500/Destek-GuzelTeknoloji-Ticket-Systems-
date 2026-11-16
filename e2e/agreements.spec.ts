import { test, expect, type Page } from '@playwright/test';
const customerId = 'd4bdfe56-9948-4ed2-942e-e44d76354186';
const ticketId = '64dfea56-9948-4ed2-942e-e44d76354186';
const agreementId = 'f4bdfe56-9948-4ed2-942e-e44d76354186';
async function setup(page: Page, role = 'ADMIN') {
  const customer = { id: customerId, name: 'Örnek Firma', email: 'customer@example.test', phone: '5301234567', company: 'Örnek', role: 'CUSTOMER', isActive: true, loginEmail: null };
  const agreement = { id: agreementId, customerId, customer, name: 'Yıllık Bakım', type: 'YEARLY', startsOn: '2026-01-01', endsOn: '2027-12-31', fee: '25000', credits: 100, usedCredits: 20, remainingCredits: 80, usable: true, state: 'ACTIVE' };
  const agreements = [agreement];
  let status = 'OPEN';
  const writes: { path: string; body: any }[] = [];
  const conversation = () => ({ id: ticketId, number: 123, customerId, subject: 'Destek talebi', customer, department: { id: 'dep', name: 'Destek' }, channel: 'TICKET', replyChannels: ['TICKET'], status, priority: 'NORMAL', tags: [], assignees: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await page.addInitScript(() => localStorage.setItem('helpdesk-theme', 'dark'));
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const method = route.request().method();
    if (['POST', 'PATCH', 'PUT'].includes(method) && !path.startsWith('/auth')) writes.push({ path, body: route.request().postDataJSON() });
    const send = (data: unknown) => route.fulfill({ json: { success: true, data, pagination: { page: 1, total: Array.isArray(data) ? data.length : 0, totalPages: 1, limit: 15 }, unreadCount: 0 } });
    if (path === '/auth/refresh') return send({ accessToken: 'test', user: role === 'CUSTOMER' ? customer : { id: 'staff', name: 'Yönetici', role } });
    if (path === `/customers/${customerId}/agreements`) {
      if (method === 'POST') { const input = route.request().postDataJSON(); agreements.push({ ...agreement, ...input, id: 'new-agreement', usedCredits: 0, remainingCredits: input.credits }); }
      return send({ customer, parent: null, children: [], agreements, availableCredits: agreements.reduce((sum, a) => sum + a.remainingCredits, 0), charges: Array.from({ length: 25 }, (_, i) => ({ id: 'charge-' + i, credits: i + 1, createdAt: '2026-11-14T10:00:00Z', agreement: { name: 'Yıllık Bakım' }, conversation: { id: ticketId, number: 123, subject: 'Destek talebi', customer: { name: customer.name } } })) });
    }
    if (path === `/conversations/${ticketId}/credit-options`) return send({ agreements, charge: null });
    if (path === `/conversations/${ticketId}`) {
      if (method === 'PATCH') status = route.request().postDataJSON().status;
      return send(conversation());
    }
    if (path === '/customers') return send([customer]);
    if (path === `/customers/${customerId}/relations`) return send({ customer, parent: null, children: [] });
    if (path === '/staff-presence') return send({ staff: [], idleMinutes: 5 });
    if (path === '/auth/security') return send({ enabled: false });
    return send([]);
  });
  return writes;
}
test('Customer agreements contain purchases and history; family management opens separately', async ({ page }) => {
  const writes = await setup(page);
  await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Örnek Firma anlaşmaları', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAttribute('aria-label', 'Örnek Firma — Anlaşmalar');
  await expect(dialog.getByText('Kullanılabilir kredi', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '+ Anlaşma Ekle', exact: true }).click();
  await dialog.getByLabel('Anlaşma Adı', { exact: true }).fill('Ek Destek');
  await dialog.getByLabel('Başlangıç Tarihi', { exact: true }).fill('2026-11-14');
  await expect(dialog.getByLabel('Bitiş Tarihi', { exact: true })).toHaveValue('2026-12-13');
  await dialog.getByRole('textbox', { name: 'Anlaşma Türü', exact: true }).click();
  await page.getByRole('option', { name: 'Yıllık', exact: true }).click();
  await expect(dialog.getByLabel('Bitiş Tarihi', { exact: true })).toHaveValue('2027-11-13');
  await dialog.getByLabel('Başlangıç Tarihi', { exact: true }).fill('2026-01-31');
  await dialog.getByRole('textbox', { name: 'Anlaşma Türü', exact: true }).click();
  await page.getByRole('option', { name: 'Aylık', exact: true }).click();
  await expect(dialog.getByLabel('Bitiş Tarihi', { exact: true })).toHaveValue('2026-02-28');
  await dialog.getByRole('textbox', { name: 'Anlaşma Türü', exact: true }).click();
  await page.getByRole('option', { name: 'Bakım Anlaşması', exact: true }).click();
  await dialog.getByLabel('Bitiş Tarihi', { exact: true }).fill('2027-05-01');
  await expect(dialog.getByLabel('Bitiş Tarihi', { exact: true })).toHaveValue('2027-05-01');
  await expect(dialog.locator('input[name=fee]')).toHaveCount(0);
  await dialog.getByLabel('Kredi Miktarı').fill('25');
  await dialog.getByRole('button', { name: 'Anlaşmayı Kaydet', exact: true }).click();
  await expect(dialog.locator('.agreement-entry-form')).toHaveCount(0);
  await expect(dialog.getByText('Anlaşma eklendi.', { exact: true })).toHaveCount(0);
  expect(writes[0].body.credits).toBe(25);
  expect(writes[0].body.fee).toBeUndefined();
  await expect(dialog.locator('.agreement-header-credit').getByText('105', { exact: true })).toBeVisible();
  await page.screenshot({ path: '.local/agreements-staff.png', fullPage: true });
  await expect(dialog.getByRole('tab')).toHaveCount(0);
  await dialog.getByRole('button', { name: '+ Anlaşma Ekle', exact: true }).click();
  await dialog.getByLabel('Anlaşma Adı', { exact: true }).fill('Kaybolmayan taslak');
  const history = dialog.locator('header').getByRole('button', { name: 'Kredi Hareketleri', exact: true });
  await expect(history).toBeVisible();
  await history.click();
  const log = dialog.getByRole('table', { name: 'Kredi Hareketleri', exact: true });
  await expect(log).toBeVisible();
  await expect(log.getByRole('row')).toHaveCount(21);
  await expect(log.getByRole('link').first()).toHaveAttribute('href', '/admin/conversations/' + ticketId);
  await page.screenshot({ path: '.local/credit-history-table.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/credit-history-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByRole('button', { name: 'Sonraki', exact: true }).click();
  await expect(log.getByRole('row')).toHaveCount(6);
  await dialog.getByRole('button', { name: 'Anlaşmalara Dön', exact: true }).click();
  await expect(dialog.getByLabel('Anlaşma Adı', { exact: true })).toHaveValue('Kaybolmayan taslak');
  await expect(dialog.getByRole('tab', { name: 'Müşteri Girişi', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('tab', { name: 'Bağlı Müşteriler', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Kapat', exact: true }).click();
  await page.getByRole('button', { name: 'Örnek Firma bağlı müşterileri', exact: true }).click();
  const relations = page.getByRole('dialog', { name: 'Örnek Firma — Bağlı Müşteriler' });
  await expect(relations.getByRole('button', { name: 'Alt Müşteri Ekle', exact: true })).toBeVisible();
  await expect(relations.getByRole('textbox', { name: 'Ana Müşteri Seçin', exact: true })).toHaveCount(0);
  await relations.getByRole('button', { name: 'Bu müşteriyi bir ana müşteriye bağla', exact: true }).click();
  await expect(relations.getByRole('textbox', { name: 'Ana Müşteri Seçin', exact: true })).toBeVisible();
  await expect(relations.getByRole('button', { name: 'Alt Müşteri Ekle', exact: true })).toHaveCount(0);
  await page.screenshot({ path: '.local/customer-relations-simplified.png', fullPage: true });
  await expect(relations.getByRole('tab')).toHaveCount(0);
});
test('Resolution asks for credits and cancel leaves the ticket untouched', async ({ page }) => {
  const writes = await setup(page);
  await page.goto(`/admin/conversations/${ticketId}`);
  await page.getByRole('button', { name: 'Çözüldü Olarak İşaretle', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Talebi Çöz' });
  await expect(dialog).toHaveCSS('max-width', '560px');
  await expect(dialog.locator('header')).toHaveCSS('border-bottom-style', 'solid');
  await expect(dialog.locator('footer')).toHaveCSS('border-top-style', 'solid');
  await expect(dialog.locator('footer').getByRole('button', { name: 'Çözümü Kaydet', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Kapat', exact: true }).click();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Çözüldü Olarak İşaretle', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Kullanılacak Anlaşma', exact: true }).click();
  await page.getByRole('option', { name: /Yıllık Bakım/ }).click();
  await dialog.getByRole('spinbutton', { name: 'Kullanılacak Kredi', exact: true }).fill('5');
  await page.screenshot({ path: '.local/agreements-resolution.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Çözümü Kaydet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes.at(-1)?.body).toEqual({ status: 'RESOLVED', creditResolution: { agreementId, credits: 5 } });
});
test('Customer portal shows balance and history without staff-only controls', async ({ page }) => {
  await setup(page, 'CUSTOMER');
  await page.goto('/customer/agreements');
  await expect(page.getByRole('heading', { name: 'Anlaşmalarım ve Kredilerim' })).toBeVisible();
  await expect(page.getByText('Kullanılabilir kredi', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Anlaşma Ekle' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Müşteri Girişi' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/agreements-customer-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Missing related customers can be created and linked directly', async ({ page }) => {
  await setup(page);
  let parent: any = null;
  const children: any[] = [];
  const writes: any[] = [];
  await page.route('**/api/v1/customers/' + customerId + '/relations', route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON(); writes.push(input);
      const person = { ...input.customer, id: 'new-person', isActive: true };
      if (input.direction === 'CHILD') children.push(person); else parent = person;
      return route.fulfill({ json: { success: true, data: person } });
    }
    return route.fulfill({ json: { success: true, data: { parent, children } } });
  });
  await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Örnek Firma bağlı müşterileri', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '+ Yeni Kişi Ekle', exact: true }).click();
  await dialog.locator('input[name=name]').fill('Yeni Kişi');
  await dialog.locator('input[name=email]').fill('new@example.test');
  await dialog.locator('input[name=phone]').fill('5301234567');
  await page.screenshot({ path: '.local/customer-quick-create.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Oluştur ve Bağla', exact: true }).click();
  await expect(dialog.getByText('Yeni Kişi', { exact: true })).toBeVisible();
  expect(writes[0]).toMatchObject({ direction: 'CHILD', customer: { name: 'Yeni Kişi', email: 'new@example.test', company: 'Örnek', phone: '5301234567' } });
  children.length = 0;
  await page.reload();
  await page.getByRole('button', { name: 'Örnek Firma bağlı müşterileri', exact: true }).click();
  await dialog.getByRole('button', { name: 'Bu müşteriyi bir ana müşteriye bağla', exact: true }).click();
  await dialog.getByRole('button', { name: '+ Yeni Ana Müşteri Ekle', exact: true }).click();
  await dialog.locator('input[name=name]').fill('Yeni Merkez');
  await dialog.locator('input[name=company]').fill('Merkez Şirket');
  await dialog.locator('input[name=email]').fill('parent@example.test');
  await dialog.locator('input[name=phone]').fill('5301234567');
  await dialog.getByRole('button', { name: 'Oluştur ve Bağla', exact: true }).click();
  await expect(dialog.getByText('Yeni Merkez', { exact: true }).first()).toBeVisible();
  expect(writes[1].direction).toBe('PARENT');
});
