import { test, expect, type Page } from '@playwright/test';
const customerId = '11111111-1111-4111-8111-111111111111', typeId = '22222222-2222-4222-8222-222222222222', ticketId = '33333333-3333-4333-8333-333333333333';
async function setup(page: Page) {
  const customer = { id: customerId, name: 'Test Şirketi', role: 'CUSTOMER', isActive: true, company: 'Test', parentCustomerId: null, shareCreditsWithChildren: true };
  let types = Object.entries({ MONTHLY: 'Aylık', YEARLY: 'Yıllık', ONE_OFF: 'Ek Destek Kredisi', MAINTENANCE: 'Bakım Anlaşması' }).map(([id, name]) => ({ id, name, builtIn: true }));
  const agreements: any[] = [], writes: any[] = [], searches: any[] = [];
  const children: any[] = Array.from({ length: 12 }, (_, i) => ({ id: 'linked-' + i, name: 'Bağlı ' + String(i).padStart(2, '0'), isActive: true, personalCredits: 0 }));
  let status = 'OPEN';
  await page.addInitScript(() => localStorage.setItem('helpdesk-theme', 'dark'));
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const url = new URL(route.request().url()), path = url.pathname.replace('/api/v1', ''), method = route.request().method();
    const send = (data: unknown) => route.fulfill({ json: { success: true, data, pagination: { page: 1, total: 1, totalPages: 1, limit: 15 } } });
    if (path === '/auth/refresh') return send({ accessToken: 'test', user: { id: 'staff', name: 'Yönetici', role: 'ADMIN' } });
    if (path === '/auth/security') return send({ enabled: false });
    if (path === '/staff-presence') return send({ staff: [], idleMinutes: 5 });
    if (path === '/customers') return send([customer]);
    if (path === '/agreement-types') { if (method === 'POST') { const type = { id: typeId, name: route.request().postDataJSON().name, builtIn: false }; types.push(type); return send(type); } return send(types); }
    if (path === '/agreement-types/' + typeId && method === 'DELETE') { types = types.filter(t => t.id !== typeId); return send({}); }
    if (path === '/customers/' + customerId + '/agreements') {
      if (method === 'POST') { const input = route.request().postDataJSON(); writes.push(input); agreements.push({ ...input, id: 'agreement', customerId, customer, typeLabel: 'Danışmanlık', state: 'ACTIVE', remainingCredits: input.credits, usedCredits: 0 }); }
      return send({ customer, parent: null, children, agreements, charges: [], personalCredits: 0, parentCredits: 0, sharedCredits: 0, availableCredits: 0 });
    }
    if (path === '/customers/' + customerId + '/relations') return send({ customer, parent: null, children });
    if (path === '/customers/' + customerId + '/relation-candidates') {
      const limit = Number(url.searchParams.get('limit') || 5), pageNumber = Number(url.searchParams.get('page') || 1), search = url.searchParams.get('search') || ''; searches.push({ page: pageNumber, search });
      const candidates = Array.from({ length: 25 }, (_, i) => ({ id: 'candidate-' + i, name: 'Deneme ' + String(i).padStart(2, '0'), company: 'Firma' }));
      return route.fulfill({ json: { success: true, data: candidates.slice((pageNumber - 1) * limit, pageNumber * limit), pagination: { page: pageNumber, total: 25, totalPages: Math.ceil(25 / limit), limit } } });
    }
    if (path.startsWith('/customers/candidate-') && method === 'PUT') { writes.push({ path, body: route.request().postDataJSON() }); return send({}); }
    if (path === '/conversations/' + ticketId) { if (method === 'PATCH') { status = route.request().postDataJSON().status; writes.push({ path, body: route.request().postDataJSON() }); } return send({ id: ticketId, number: 15, subject: 'Önceden Kredilendirilen Talep', customerId, customer, creditCharge: { credits: 200, agreementId: 'old' }, department: { id: 'dep', name: 'Destek' }, channel: 'TICKET', replyChannels: ['TICKET'], status, priority: 'NORMAL', assignees: [], tags: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); }
    return send([]);
  });
  return { writes, searches };
}
test('Custom types use the ticket dropdown with add and custom-only trash, preserving old labels', async ({ page }) => {
  const { writes } = await setup(page);
  await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Test Şirketi anlaşmaları', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('details.agreement-children')).not.toHaveAttribute('open');
  await dialog.getByRole('button', { name: '+ Anlaşma Ekle', exact: true }).click();
  const select = dialog.getByRole('textbox', { name: 'Anlaşma Türü', exact: true });
  await select.click();
  await expect(dialog.locator('select')).toHaveCount(0);
  await expect(dialog.getByRole('option')).toHaveCount(4);
  await expect(dialog.locator('.agreement-type-remove')).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Yeni Anlaşma Türü', exact: true }).fill('Danışmanlık');
  await dialog.getByRole('button', { name: 'Anlaşma Türü Ekle', exact: true }).click();
  await expect(select).toHaveValue('Danışmanlık');
  await expect(dialog.getByRole('button', { name: 'Danışmanlık türünü sil', exact: true })).toBeVisible();
  await page.screenshot({ path: '.local/custom-agreement-types.png', fullPage: true });
  await dialog.getByRole('option', { name: 'Danışmanlık', exact: true }).click();
  await dialog.getByLabel('Anlaşma Adı', { exact: true }).fill('Özel Paket');
  await dialog.getByLabel('Başlangıç Tarihi').fill('2026-11-14');
  await dialog.getByLabel('Bitiş Tarihi').fill('2027-03-01');
  await dialog.getByLabel('Kredi Miktarı').fill('100');
  await dialog.getByRole('button', { name: 'Anlaşmayı Kaydet', exact: true }).click();
  await expect.poll(() => writes[0]?.type).toBe(typeId);
  await dialog.getByRole('button', { name: '+ Anlaşma Ekle', exact: true }).click();
  await select.click();
  await dialog.getByRole('button', { name: 'Danışmanlık türünü sil', exact: true }).click();
  await expect(select).toHaveValue('Aylık');
  await expect(dialog.getByRole('option')).toHaveCount(4);
  await dialog.getByRole('option', { name: 'Aylık', exact: true }).click();
  await dialog.locator('.agreement-card>summary').click();
  await expect(dialog.locator('.agreement-card-body')).toContainText('Danışmanlık');
});
test('Relation search fills the body list, pages it, selects a result and submits from the footer', async ({ page }) => {
  const { writes, searches } = await setup(page);
  await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Test Şirketi bağlı müşterileri', exact: true }).click();
  const dialog = page.getByRole('dialog'), rows = dialog.locator('.relation-results .relation-result');
  await expect(rows).toHaveCount(5);
  await dialog.getByRole('button', { name: 'Sonraki', exact: true }).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('Bağlı 05');
  const search = dialog.getByRole('textbox', { name: 'Bağlı Müşterilerde Ara', exact: true });
  await search.fill('Deneme');
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('Deneme 00');
  await expect(dialog.getByRole('option')).toHaveCount(0);
  expect((await search.boundingBox())!.width).toBeLessThan(190);
  await dialog.getByRole('button', { name: 'Sonraki', exact: true }).click();
  await expect(rows.first()).toContainText('Deneme 05');
  expect(searches.some(s => s.page === 2 && s.search === 'Deneme')).toBeTruthy();
  await rows.first().getByRole('button', { name: 'Seç', exact: true }).click();
  await page.screenshot({ path: '.local/customer-relations-search.png', fullPage: true });
  await dialog.locator('footer').getByRole('button', { name: 'Alt Müşteri Ekle', exact: true }).click();
  await expect.poll(() => writes.at(-1)?.path).toBe('/customers/candidate-5/parent');
  expect(writes.at(-1).body.parentCustomerId).toBe(customerId);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/customer-relations-search-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('Previously charged tickets resolve immediately without a second confirmation', async ({ page }) => {
  const { writes } = await setup(page);
  await page.goto('/admin/conversations/' + ticketId);
  await page.getByRole('button', { name: 'Çözüldü Olarak İşaretle', exact: true }).click();
  await expect.poll(() => writes.at(-1)?.body.status).toBe('RESOLVED');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes.at(-1).body.creditResolution).toBeUndefined();
});

test('Agreement fields align and save from the standard footer; type add stays on the right', async ({ page }) => {
  await setup(page); await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Test Şirketi anlaşmaları', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '+ Anlaşma Ekle', exact: true }).click();
  await expect(dialog.locator('footer').getByRole('button', { name: 'Anlaşmayı Kaydet', exact: true })).toBeVisible();
  const name = dialog.locator('input[name=name]'), type = dialog.locator('.agreement-type-select .searchable-dropdown');
  const nameBox = (await name.locator('..').boundingBox())!, typeBox = (await type.boundingBox())!;
  expect(Math.abs(nameBox.y - typeBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(nameBox.height - typeBox.height)).toBeLessThanOrEqual(1);
  const start = (await dialog.locator('input[name=startsOn]').boundingBox())!, end = (await dialog.locator('input[name=endsOn]').boundingBox())!;
  expect(Math.abs(start.y - end.y)).toBeLessThanOrEqual(1); expect(Math.abs(start.height - end.height)).toBeLessThanOrEqual(1);
  await name.focus(); await name.hover(); await expect(name).toHaveCSS('box-shadow', 'none');
  await dialog.getByRole('textbox', { name: 'Anlaşma Türü', exact: true }).click();
  await expect(type.locator('.searchable-dropdown-menu')).toHaveAttribute('data-placement', 'bottom');
  const inputBox = (await dialog.getByRole('textbox', { name: 'Yeni Anlaşma Türü', exact: true }).boundingBox())!;
  const addBox = (await dialog.getByRole('button', { name: 'Anlaşma Türü Ekle', exact: true }).boundingBox())!;
  expect(addBox.x).toBeGreaterThan(inputBox.x);
  await page.screenshot({ path: '.local/agreement-fields-aligned.png', fullPage: true });
});
test('Short relation modal contains its open menu and has no inner search focus ring', async ({ page }) => {
  await setup(page);
  await page.route('**/api/v1/customers/' + customerId + '/relations', route => route.fulfill({ json: { success: true, data: { customer: { id: customerId, name: 'Test Şirketi', parentCustomerId: 'parent' }, parent: { id: 'parent', name: 'Merkez' }, children: [] } } }));
  await page.goto('/admin/customers'); await page.getByRole('button', { name: 'Test Şirketi bağlı müşterileri', exact: true }).click();
  const dialog = page.getByRole('dialog'), select = dialog.locator('.relation-list-tools .searchable-dropdown'), search = dialog.getByRole('textbox', { name: 'Bağlı Müşterilerde Ara', exact: true });
  await search.focus(); await search.hover(); await expect(search).toHaveCSS('box-shadow', 'none'); await expect(search).toHaveCSS('outline-style', 'none');
  expect(Math.abs((await select.boundingBox())!.height - (await search.locator('..').boundingBox())!.height)).toBeLessThanOrEqual(1);
  const beforeOpen = (await dialog.boundingBox())!;
  await dialog.getByRole('textbox', { name: 'Ana Müşteri Seçin', exact: true }).click();
  const afterOpen = (await dialog.boundingBox())!;
  expect(afterOpen.y).toBe(beforeOpen.y); expect(afterOpen.height).toBe(beforeOpen.height);
  const menu = select.locator('.searchable-dropdown-menu');
  await expect(menu).toHaveAttribute('data-placement', 'bottom');
  await expect(select.locator('.searchable-dropdown-input')).toHaveCSS('caret-color', 'rgba(0, 0, 0, 0)');
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.y).toBeGreaterThan((await select.boundingBox())!.y); expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({ path: '.local/relation-short-popup.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
});
test('Integration inputs have plain focus without an inner halo', async ({ page }) => {
  await setup(page);
  await page.route('**/api/v1/integrations', route => route.fulfill({ json: { success: true, data: { smtpEnabled: true, smtpHost: 'smtp.example.test', smtpPort: 587, smtpUser: '', smtpPassword: '', smtpFromAddress: 'support@example.test', smtpFromName: 'Destek' } } }));
  await page.route('**/api/v1/notification-settings', route => route.fulfill({ json: { success: true, data: { ticketCreatedSubject: '', ticketCreatedBody: '', ticketReplySubject: '', ticketReplyBody: '' } } }));
  await page.goto('/admin/integrations/channels');
  for (const name of ['smtpHost', 'smtpPassword']) { const input = page.locator('input[name=' + name + ']'); await input.focus(); await input.hover(); await expect(input).toHaveCSS('box-shadow', 'none'); await expect(input).toHaveCSS('outline-style', 'none'); }
  await page.screenshot({ path: '.local/integration-input-focus.png', fullPage: true });
});

test('Standalone customers do not show company sharing controls', async ({ page }) => {
  await setup(page);
  const customer = { id: customerId, name: 'Test Şirketi', parentCustomerId: null };
  await page.route('**/api/v1/customers/' + customerId + '/agreements', route => route.fulfill({ json: { success: true, data: { customer, parent: null, children: [], agreements: [], charges: [], personalCredits: 0, parentCredits: 0, availableCredits: 0 } } }));
  await page.route('**/api/v1/customers/' + customerId + '/relations', route => route.fulfill({ json: { success: true, data: { customer, parent: null, children: [] } } }));
  await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Test Şirketi anlaşmaları', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('switch')).toHaveCount(0);
  await page.getByRole('button', { name: 'Anlaşmaları Kapat', exact: true }).click();
  await page.getByRole('button', { name: 'Test Şirketi bağlı müşterileri', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('switch')).toHaveCount(0);
});
