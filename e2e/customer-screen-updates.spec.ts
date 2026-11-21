import { test, expect, type Page } from '@playwright/test';

const companyId = '11111111-1111-4111-8111-111111111111';
const childId = '22222222-2222-4222-8222-222222222222';

async function setup(page: Page) {
  const company = {
    id: companyId, name: 'YUNUS DURGUN', company: 'Güzel Teknoloji', phone: '5301234567', email: 'yunus@example.test',
    extraPhones: '5321112233, 5334445566', extraEmails: 'ikinci@example.test, ucuncu@example.test',
    role: 'CUSTOMER', isActive: true, parentCustomerId: null, staffNote: '', availableCredits: 140,
  };
  const child = { id: childId, name: 'Baran Kişi', company: 'Güzel Teknoloji', phone: '5359998877', email: 'baran@example.test', role: 'CUSTOMER', isActive: true, parentCustomerId: companyId };
  const conversation = { id: 'conversation-1', number: 825, subject: 'deneme', status: 'OPEN', firstMessage: 'deneme', createdAt: '2026-11-18T06:18:00Z', updatedAt: '2026-11-18T07:18:00Z', assignees: [] };
  const state = { conversationQueries: [] as string[], createdBody: null as unknown, personUploads: [] as string[] };

  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();
    const send = (data: unknown, pagination: unknown = { total: Array.isArray(data) ? data.length : 0, page: 1, totalPages: 1, limit: 15 }) => route.fulfill({ json: { success: true, data, pagination } });

    if (path === '/auth/refresh') return send({ accessToken: 'test', user: { id: 'staff', name: 'Personel', role: 'ADMIN' } });
    if (path === '/auth/security') return send({ enabled: false });
    if (path === '/customers' && method === 'GET') return send([company], { total: 1, page: 1, totalPages: 1, limit: 10 });
    if (path === `/customers/${companyId}`) return send(company);
    if (path === `/customers/${childId}`) return send(child);
    if (path === `/customers/${companyId}/relations`) {
      if (method === 'POST') return route.fulfill({ status: 201, json: { success: true, data: { id: 'created-person' } } });
      return send({ customer: company, parent: null, children: [child] });
    }
    if (path === '/customers/created-person' && method === 'PATCH') {
      if ((route.request().headers()['content-type'] ?? '').includes('multipart/form-data')) state.personUploads.push('created-person');
      return send({ id: 'created-person' });
    }
    if (path === '/conversations' && method === 'GET') {
      state.conversationQueries.push(url.searchParams.get('customerId') ?? '');
      return send([conversation], { total: 1, page: 1, totalPages: 1, limit: 15 });
    }
    if (path === '/conversations' && method === 'POST') {
      state.createdBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { success: true, data: { id: 'new-conversation' } } });
    }
    if (path === `/customers/${companyId}/agreements`) return send({ customer: company, children: [child], parent: null, agreements: [], charges: [], availableCredits: 0, personalCredits: 0, sharedCredits: 0, parentCredits: 0 });
    if (path === `/customers/${companyId}/files`) return send([]);
    if (path === '/status-options') return send([]);
    if (path === '/communication-channels') return send({ EMAIL: true, SMS: false, WHATSAPP: false, FORM: true, defaultDepartment: { id: 'department-1', name: 'Genel Destek' } });
    return send([]);
  });
  return state;
}

test('conversations tab filters by company person and keeps filters right aligned', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`/admin/customers/${companyId}?section=conversations`);
  const personFilter = page.getByRole('button', { name: 'Görüşme kişisi', exact: true });
  await expect(personFilter).toContainText('Güzel Teknoloji');
  await personFilter.click();
  await page.getByRole('option', { name: 'Baran Kişi', exact: true }).click();
  await expect.poll(() => state.conversationQueries.at(-1)).toBe(childId);
  await expect(page.getByText('deneme', { exact: true }).first()).toBeVisible();
  const filters = page.locator('.customer-requests-filters');
  await expect(filters.getByText('Durum', { exact: true })).toBeVisible();
  await expect(filters.getByText('Kayıt sayısı', { exact: true })).toBeVisible();
  const box = await filters.boundingBox();
  const statusBox = await filters.getByRole('button', { name: 'Mevcut talepler durum filtresi', exact: true }).boundingBox();
  const heading = await page.getByRole('heading', { name: /Mevcut Talepler/ }).boundingBox();
  expect(box!.x).toBeGreaterThan(heading!.x + heading!.width);
  expect(Math.abs(box!.y - heading!.y)).toBeLessThan(20);
  expect(statusBox!.x).toBeGreaterThan(box!.x);
  await expect(filters.locator('.styled-dropdown-label')).toHaveCount(3);
  const cards = await page.locator('.customer-request-cards-scroll').boundingBox();
  expect(Math.abs(cards!.x - heading!.x)).toBeLessThan(5);
  expect(cards!.width).toBeGreaterThan(box!.width);
  await page.screenshot({ path: 'output/customer-conversation-filters.png' });
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(personFilter).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('request tab creates the conversation for the selected company person', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`/admin/customers/${companyId}?section=request`);
  const person = page.getByRole('button', { name: 'Talep açılacak kişiyi seçin', exact: true });
  await expect(person).toContainText('(şirket)');
  await person.click();
  await page.getByRole('option', { name: 'Baran Kişi', exact: true }).click();
  await expect(person).toContainText('Baran Kişi');
  await expect(page.getByLabel('Seçilen Kişi', { exact: true })).toHaveCount(0);
  await page.getByLabel('Konu', { exact: true }).fill('Kişiye özel talep');
  await page.getByLabel('Açıklama', { exact: true }).fill('Bu talep şirkete bağlı kişi için açılmalı.');
  await page.getByRole('button', { name: 'Talebi Oluştur', exact: true }).click();
  await expect.poll(() => (state.createdBody as { customerId?: string } | null)?.customerId).toBe(childId);
});

test('new company person can be created with a file attached', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`/admin/customers/${companyId}?section=people`);
  await page.getByRole('button', { name: 'Kişi Ekle', exact: true }).click();
  await page.getByLabel('Ad Soyad', { exact: true }).fill('Dosyalı Kişi');
  await page.locator('input[name=email]').fill('dosyali@example.test');
  await page.getByLabel('Telefon', { exact: true }).fill('5301234567');
  await expect(page.locator('.company-person-file-button')).toBeVisible();
  await page.getByLabel('Kişiye dosya ekle', { exact: true }).setInputFiles({ name: 'sozlesme.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(page.locator('.company-person-upload')).toContainText('1 dosya seçildi');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect.poll(() => state.personUploads.length).toBe(1);
});

test('customer list shows extra phone and e-mail on hover', async ({ page }) => {
  await setup(page);
  await page.goto('/admin/customers');
  const phoneLine = page.locator('.customer-contact-text').first();
  await expect(phoneLine).toHaveText('0530 123 45 67');
  await phoneLine.hover();
  await expect(page.getByRole('tooltip')).toContainText('0532 111 22 33');
  await expect(page.getByRole('tooltip')).toContainText('0533 444 55 66');
  await page.locator('.customer-contact-text').nth(1).hover();
  await expect(page.getByRole('tooltip')).toContainText('ikinci@example.test');
  await expect(page.getByRole('tooltip')).toContainText('ucuncu@example.test');
  await page.mouse.move(10, 10);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('customer file list and upload are readable in dark mode', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => localStorage.setItem('helpdesk-theme', 'dark'));
  await page.goto(`/admin/customers/${companyId}`);
  await expect(page.locator('.customer-file-upload')).toHaveCSS('background-color', 'rgb(23, 39, 52)');
  await page.screenshot({ path: '.local/customer-files-dark.png', fullPage: true });
});

for (const theme of ['light', 'dark']) {
 test('customer details and request fields share card surface in ' + theme, async ({ page }) => {
  await page.addInitScript(theme => localStorage.setItem('helpdesk-theme', theme), theme);
  await setup(page);
  for (const section of ['details', 'request']) {
   await page.goto('/admin/customers/' + companyId + '?section=' + section);
   const content = page.locator('.customer-management-content');
   await expect(content.locator('.field-label').first()).toBeVisible();
   const result = await content.evaluate(root => {
    const surface = getComputedStyle(root).backgroundColor;
    const labels = [...root.querySelectorAll('.field-label, .styled-dropdown-label')];
    const fields = [...root.querySelectorAll('label:has(> .field-label), .styled-dropdown:has(> .styled-dropdown-label), label:has(> .field-label) > input, label:has(> .field-label) > textarea, .email-field > input')];
    return { labelsMatch: labels.every(label => getComputedStyle(label).backgroundColor === surface), transparent: fields.every(field => getComputedStyle(field).backgroundColor === 'rgba(0, 0, 0, 0)') };
   });
   expect(result).toEqual({ labelsMatch: true, transparent: true });
  }
 });
}

test('customer list shows available credit before status and keeps actions last', async ({ page }) => {
 await setup(page);
 await page.goto('/admin/customers');
 const table = page.locator('.customer-list-table');
 await expect(table.locator('thead th').nth(2)).toHaveText('Kredi');
 await expect(table.locator('thead th').nth(3)).toHaveText('Durum');
 await expect(table.locator('thead th').last()).toHaveText('İşlemler');
 await expect(table.locator('.customer-credit-cell')).toHaveText('140');
});

test('customer files use free width and stack below details when space narrows', async ({ page }) => {
 await setup(page);
 await page.setViewportSize({ width: 1900, height: 1000 });
 await page.goto('/admin/customers/' + companyId);
 const form = page.locator('.customer-details-form'), files = page.locator('.customer-files-workspace');
 await expect(files).toBeVisible();
 let formBox = await form.boundingBox(), fileBox = await files.boundingBox();
 expect(fileBox!.x).toBeGreaterThanOrEqual(formBox!.x + formBox!.width);
 expect(Math.abs(fileBox!.y - formBox!.y)).toBeLessThan(2);
 await page.setViewportSize({ width: 1000, height: 1000 });
 formBox = await form.boundingBox(); fileBox = await files.boundingBox();
 expect(fileBox!.y).toBeGreaterThanOrEqual(formBox!.y + formBox!.height);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.setViewportSize({ width: 600, height: 900 });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
