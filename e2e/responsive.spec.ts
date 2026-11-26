import { test, expect, type Page } from '@playwright/test';

const customer = { id: 'mobile-customer', role: 'CUSTOMER', name: 'Uzun İsimli Test Müşterisi', email: 'customer@example.test', phone: '05301234567', company: 'Uzun Firma Şirket Adı' };
const admin = { id: 'mobile-admin', name: 'Test Yönetici', role: 'ADMIN', email: 'admin@example.test' };
const department = { id: 'mobile-department', name: 'Genel Destek', isActive: true };
const conversation = { id: 'mobile-ticket', number: 50, subject: 'Mobil ekranlarda uzun başlıklı destek talebi', channel: 'FORM', replyChannels: ['FORM', 'EMAIL', 'WHATSAPP', 'SMS', 'TICKET'], status: 'OPEN', priority: 'NORMAL', customer, customerId: customer.id, department, departmentId: department.id, createdBy: admin, tags: [], createdAt: '2026-10-21T10:00:00Z' };

async function mocks(page: Page) {
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const empty = { success: true, data: [], pagination: { page: 1, total: 0, totalPages: 1 } };
    if (path === '/auth/refresh') return route.fulfill({ json: { data: { accessToken: 'test', user: admin } } });
    if (path === '/auth/security') return route.fulfill({ json: { data: { enabled: false, siteKey: null } } });
    if (path === '/public/form/settings') return route.fulfill({ json: { data: { enabled: true, title: 'Destek Talebi', requirePhone: false, requireCompany: false, requireSubject: true, requireMessage: true } } });
    if (path === '/public/form/conversation') return route.fulfill({ json: { data: { number: 50, subject: conversation.subject, status: 'Açık', closed: false, messages: [{ id: 'public-message', type: 'AGENT_REPLY', body: 'Mobil mesaj', author: admin, attachments: [], createdAt: conversation.createdAt }], hasMore: false, direction: 'latest' } } });
    if (path === '/communication-channels') return route.fulfill({ json: { data: { EMAIL: true, SMS: true, WHATSAPP: true, FORM: true } } });
    if (path === '/departments') return route.fulfill({ json: { ...empty, data: [department] } });
    if (path === `/customers/${customer.id}`) return route.fulfill({ json: { data: customer } });
    if (path === '/customers') return route.fulfill({ json: { ...empty, data: [customer] } });
    if (path === `/conversations/${conversation.id}`) return route.fulfill({ json: { data: conversation } });
    if (path === `/conversations/${conversation.id}/messages`) return route.fulfill({ json: { ...empty, data: [
      { id: 'incoming', type: 'CUSTOMER_MESSAGE', body: 'Mobil ekranlarda mesajlar rahat okunmalı. ' + 'UzunMesaj'.repeat(30), author: customer, createdAt: conversation.createdAt, attachments: [] },
      { id: 'outgoing', type: 'AGENT_REPLY', body: 'Destek yanıtı', author: admin, createdAt: '2026-10-21T10:01:00Z', attachments: [] },
    ] } });
    if (path === '/dashboard') return route.fulfill({ json: { data: { statuses: {}, total: 0, unassigned: 0 } } });
    if (path === '/staff-presence') return route.fulfill({ json: { data: { staff: [], idleMinutes: 15 } } });
    return route.fulfill({ json: empty });
  });
}
async function fits(page: Page) {
  const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);
}

test('mobile navigation, equal request fields and composer fit phones and tablets; desktop stays expanded', async ({ page }) => {
  await mocks(page);
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/admin/phone-support?customerId=${customer.id}`);
    await expect(page.locator('.phone-support-action-panel-v2')).toBeVisible();
    await expect(page.locator('.sidebar')).toBeHidden();
    const open = page.getByRole('button', { name: 'Çalışma Alanı Menüsünü Aç', exact: true });
    await open.click();
    await expect(page.getByRole('dialog', { name: 'Çalışma Alanı', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(open).toBeFocused();
    await open.click();
    await page.locator('.sidebar').getByRole('link', { name: 'Dosyalar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dosya Paylaşımı' })).toBeVisible();
    await expect(page.locator('.sidebar')).toBeHidden();
    await page.locator('.files-tools').scrollIntoViewIfNeeded();
    for (const button of await page.locator('.files-tools>button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
    await fits(page);
    await page.goto(`/admin/phone-support?customerId=${customer.id}`);
    const grid = page.locator('.phone-support-action-panel-v2 .phone-request-grid');
    await expect(grid).toBeVisible();
    const boxes = await grid.locator(':scope > *').evaluateAll(items => items.map(item => item.getBoundingClientRect()).filter(box => box.width > 0).map(box => ({ x: box.x, width: box.width })));
    for (const box of boxes) { expect(box.x).toBeCloseTo(boxes[0].x, 0); expect(box.width).toBeCloseTo(boxes[0].width, 0); }
    await fits(page);
    await page.goto(`/admin/conversations/${conversation.id}`);
    const reply = page.getByRole('textbox', { name: 'Yanıtınız', exact: true });
    await expect(reply).toBeVisible();
    await reply.fill('Mobil taslak');
    await fits(page);
    const info = page.getByRole('button', { name: 'Talep Bilgileri', exact: true });
    await info.click();
    await expect(page.locator('.ticket-properties .ticket-status-priority-row')).toBeVisible();
    await info.click();
    await expect(page.locator('.ticket-properties .ticket-status-priority-row')).toBeHidden();
    await expect(reply).toHaveValue('Mobil taslak');
    await page.screenshot({ path: `.local/responsive-conversation-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/phone-support');
  await page.getByRole('button', { name: 'Yeni Kişi Ekle', exact: true }).click();
  await expect(page.locator('.phone-support-create-v2')).toBeVisible();
  await fits(page);
  await page.screenshot({ path: '.local/responsive-new-customer.png', fullPage: true, animations: 'disabled' });
  await page.goto(`/admin/conversations/${conversation.id}`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Talep Bilgileri', exact: true })).toBeHidden();
  await expect(page.locator('.ticket-properties .ticket-status-priority-row')).toBeVisible();
  await fits(page);
});

test('public form, tracking, replies and login fit narrow screens', async ({ page }) => {
  await mocks(page);
  await page.route('**/api/v1/auth/refresh', route => route.fulfill({ status: 401, json: { error: { message: 'Oturum yok' } } }));
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/auth', '/form/destek', '/form/talep', `/form/talep#${'b'.repeat(64)}`]) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('main input, main textarea').first()).toBeVisible();
      await fits(page);
      await page.screenshot({ path: `.local/responsive-${path === '/auth' ? 'login' : path.includes('#') ? 'reply' : path.endsWith('destek') ? 'form' : 'tracking'}-${width}.png`, fullPage: true, animations: 'disabled' });
    }
  }
});

test('workspace overview, inbox, directories and files stay within mobile viewport', async ({ page }) => {
  await mocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/admin/dashboard', '/admin/conversations', '/admin/customers', '/admin/users', '/admin/staff-presence', '/admin/files']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await fits(page);
    if (path === '/admin/conversations') {
      for (const label of ['Telefon', 'SMS', 'Form', 'Bana atanan', 'Atanmamış']) {
        const tab = page.locator('.ticket-panel>.tabs').getByRole('button', { name: label, exact: true });
        await tab.scrollIntoViewIfNeeded();
        await expect(tab).toBeInViewport();
        const box = (await tab.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(390);
      }
      await page.locator('.ticket-panel>.tabs').getByRole('button', { name: 'Bana atanan', exact: true }).click();
      await expect(page.locator('.ticket-panel>.tabs').getByRole('button', { name: 'Bana atanan', exact: true })).toHaveClass('active');
      await page.locator('.ticket-panel>.tabs').getByRole('button', { name: 'Atanmamış', exact: true }).click();
      await expect(page.locator('.ticket-panel>.tabs').getByRole('button', { name: 'Atanmamış', exact: true })).toHaveClass('active');
    }
    await page.screenshot({ path: `.local/responsive-${path.split('/').at(-1)}.png`, fullPage: true, animations: 'disabled' });
  }
});
