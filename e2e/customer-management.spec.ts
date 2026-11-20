import { test, expect, type Page } from '@playwright/test';

const id = '11111111-1111-4111-8111-111111111111';
async function setup(page: Page, role = 'ADMIN', readOnly = false, permissions?: string[]) {
  const customer = { id, name: 'YUNUS DURGUN', company: 'Güzel Teknoloji', phone: '5301234567', email: 'yunus@example.test', role: 'CUSTOMER', isActive: true, parentCustomerId: null };
  const files = [{ id: 'file', originalName: 'Sözleşme.pdf', size: 2048, mimeType: 'application/pdf' }];
  const writes: string[] = [];
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/refresh') data = { accessToken: 'test', user: { id: 'staff', name: 'Personel', role, ...(permissions || readOnly ? { rolePermissions: permissions ?? ['customers.view'] } : {}) } };
    if (path === '/auth/security') data = { enabled: false };
    if (path === '/customers') data = [customer];
    if (path === `/customers/${id}`) {
      if (route.request().method() === 'PATCH') {
        writes.push(path);
        const request = route.request();
        const form = await new Request(request.url(), { method: 'POST', headers: { 'content-type': request.headers()['content-type'] }, body: request.postDataBuffer()! }).formData();
        if (form.get('company')) customer.company = String(form.get('company'));
        for (const file of form.getAll('files')) if (typeof file !== 'string') files.push({ id: `file-${files.length}`, originalName: file.name, size: file.size, mimeType: file.type });
      }
      data = customer;
    }
    if (path === `/customers/${id}/relations`) data = { customer, children: [] };
    if (path === `/customers/${id}/agreements`) data = { customer, children: [], parent: null, availableCredits: 0, personalCredits: 0, sharedCredits: 0, parentCredits: 0, agreements: [], charges: [] };
    if (path === `/customers/${id}/files`) data = files;
    if (path === `/customers/${id}/files/file/download`) return route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' });
    if (path === '/communication-channels') data = { EMAIL: true, SMS: false, WHATSAPP: false, FORM: true, defaultDepartment: null };
    return route.fulfill({ json: { success: true, data, pagination: { total: Array.isArray(data) ? data.length : 0, page: 1, totalPages: 1, limit: 10 } } });
  });
  return writes;
}

test('customer list opens with a single click and exposes top-level management tabs', async ({ page }) => {
  const writes = await setup(page);
  await page.goto('/admin/customers');
  const row = page.locator('.customer-list-table tbody tr');
  await expect(row.locator('td').first()).toHaveText('Güzel Teknoloji');
  await expect(row.locator('td').nth(1)).toContainText('YUNUS DURGUN');
  await expect(row.getByRole('button')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Varsayılan Sıralamaya Dön', exact: true })).toHaveCount(0);
  await expect(page.locator('.customer-list-table thead th').last()).toHaveText('İşlemler');
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/customers/${id}$`));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.customer-management-status')).toHaveCount(0);
  await expect(page.getByText('Müşteri / Şirket Yönetimi', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Şirket ve Müşteri Bilgileri' })).toHaveCount(0);
  await expect(page.locator('.customer-management-heading h1')).toHaveText('Güzel Teknoloji');
  const note = page.getByLabel('Müşteri Notu', { exact: true });
  await expect(note).toHaveCSS('resize', 'none');
  await page.getByLabel('Şirket Adı *', { exact: true }).fill('Yeni Şirket');
  await page.getByRole('button', { name: 'Değişiklikleri Kaydet' }).click();
  await expect(page.getByRole('heading', { name: 'Yeni Şirket', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Müşteri bilgileri kaydedildi.' })).toBeVisible();
  expect(writes).toHaveLength(1);
  const nav = page.getByRole('navigation', { name: 'Müşteri yönetimi bölümleri' });
  for (const label of ['Anlaşmalar ve Krediler', 'Şirkete Bağlı Kişiler', 'Kredi Hareketleri', 'Görüşmeler', 'Talep Aç', 'Müşteri Bilgileri']) {
    await nav.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('region', { name: label, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: label, exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await expect(page.getByText('Sözleşme.pdf', { exact: true })).toBeVisible();
  await page.getByLabel('Dosya Ekle', { exact: true }).setInputFiles({ name: 'not.txt', mimeType: 'text/plain', buffer: Buffer.from('Müşteri notu') });
  await page.getByRole('button', { name: 'Dosyaları Yükle', exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  await expect(page.getByRole('button', { name: 'not.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sözleşme.pdf aç', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Dosya görüntüleme', exact: true })).toBeVisible();
  await expect(page.locator('iframe[title="Sözleşme.pdf"]')).toBeVisible();
  await page.getByRole('button', { name: 'Dosya görüntülemeyi kapat', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Müşteri Bilgileri', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'not.txt', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Müşterilere Dön' }).click();
  await expect(page).toHaveURL(/\/admin\/customers$/);
});

test('legacy company section links open the matching top-level tab', async ({ page }) => {
  await setup(page);
  await page.goto(`/admin/customers/${id}?section=company&companySection=people`);
  await expect(page.getByRole('region', { name: 'Şirkete Bağlı Kişiler', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Şirkete Bağlı Kişiler', exact: true })).toBeVisible();
});

test('read-only staff can inspect customer pages without edit or request controls', async ({ page }) => {
  await setup(page, 'AGENT', true);
  await page.goto(`/agent/customers/${id}`);
  await expect(page.getByLabel('Şirket Adı *', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Değişiklikleri Kaydet' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Talep Aç', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Şirkete Bağlı Kişiler', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kişi Ekle', exact: true })).toHaveCount(0);
});

test('staff without assignment or deletion permission can describe a request and upload but cannot delete files', async ({ page }) => {
  await setup(page, 'AGENT', false, ['customers.view', 'customers.update', 'conversations.view', 'conversations.create']);
  await page.goto(`/agent/customers/${id}?section=request`);
  await expect(page.getByLabel('Açıklama', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Müşteri Bilgileri', exact: true }).click();
  await expect(page.getByLabel('Dosya Ekle', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sözleşme.pdf sil', exact: true })).toHaveCount(0);
});

for (const theme of ['dark', 'light']) test(`customer list fits available width with normal and long text in ${theme}`, async ({ page }) => {
  await setup(page);
  await page.addInitScript(value => localStorage.setItem('helpdesk-theme', value), theme);
  await page.goto('/admin/customers');
  const wrapper = page.locator('.management-table-wrap').filter({ has: page.locator('.customer-list-table') });
  await expect(page.locator('.customer-list-table tbody tr')).toHaveCount(1);
  for (const width of [1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await wrapper.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.route('**/api/v1/customers?**', route => route.fulfill({ json: { success: true, data: [{ id, name: 'Çok uzun müşteri iletişim kişisi adı '.repeat(5), company: 'UzunŞirketAdı'.repeat(12), email: `${'uzunadres'.repeat(12)}@example.test`, phone: '5301234567', isActive: true }], pagination: { total: 1, totalPages: 1, page: 1, limit: 10 } } }));
  await page.reload();
  await expect(page.locator('.customer-list-table tbody tr')).toContainText('UzunŞirketAdı');
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await wrapper.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page.locator('.customer-list-table tbody tr').getByRole('button')).toBeVisible();
    await page.screenshot({ path: `.local/customers-long-${theme}-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await wrapper.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const theme of ['dark', 'light']) test(`customer request uses the page surface in ${theme}`, async ({ page }) => {
  await setup(page);
  await page.addInitScript(value => localStorage.setItem('helpdesk-theme', value), theme);
  await page.goto(`/admin/customers/${id}?section=request`);
  await expect(page.getByLabel('Konu', { exact: true })).toBeVisible();
  await expect(page.locator('.customer-request-workspace')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.customer-request-workspace > form')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.getByLabel('Konu', { exact: true }).fill('Uzun konu metni '.repeat(12));
  await page.getByLabel('Açıklama', { exact: true }).fill('Ayrıntılı müşteri talebi açıklaması. '.repeat(150));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: `.local/customer-request-surface-${theme}.png`, fullPage: true });
});

for (const theme of ['dark', 'light']) test(`customer management fits mobile and desktop in ${theme} theme`, async ({ page }) => {
  await setup(page);
  await page.addInitScript(value => localStorage.setItem('helpdesk-theme', value), theme);
  await page.goto(`/admin/customers/${id}`);
  await expect(page.locator('.customer-management-heading h1')).toHaveText('Güzel Teknoloji');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `.local/customer-management-${theme}-${width}.png`, fullPage: true });
  }
});
