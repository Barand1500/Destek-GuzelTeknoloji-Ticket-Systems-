import { test, expect, type Page } from '@playwright/test';

async function workspace(page: Page, theme = 'dark') {
  await page.addInitScript(theme => localStorage.setItem('helpdesk-theme', theme), theme);
  const customer = { id: 'customer', name: 'Uzun İsimli Örnek Müşteri', company: 'Güzel Teknoloji Destek Hizmetleri', email: 'uzun.musteri.adresi@example.test', phone: '05301234567', isActive: true, availableCredits: 15 };
  const department = { id: 'department', name: 'Teknik Destek ve Müşteri İlişkileri', isActive: true };
  const person = { id: 'person', name: 'Uzun İsimli Destek Personeli', email: 'uzun.personel.adresi@example.test', phone: '05301234567', role: 'AGENT', isActive: true, departments: [{ department }], skills: [] };
  const ticket = { id: 'ticket', number: 136, subject: 'Mobil görünümde okunabilir uzun destek talebi başlığı', channel: 'TICKET', status: 'CLOSED', priority: 'NORMAL', customer, department, tags: [], createdBy: person, createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z', creditCharge: { credits: 15 } };
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: unknown = [];
    if (path === '/auth/refresh') data = { accessToken: 'test', user: { id: 'admin', name: 'Yönetici', role: 'ADMIN' } };
    if (path === '/auth/security') data = { enabled: false };
    if (path === '/public/license') data = { enabled: false, valid: true, status: 'DISABLED' };
    if (path === '/customers') data = [customer];
    if (path === '/users') data = [person];
    if (path === '/departments') data = [department];
    if (path === '/websites') data = [{ id: 'project', name: 'Örnek Destek Projesi', url: 'https://example.test', isActive: true, guideFileCount: 0 }];
    if (path === '/conversations') data = [ticket];
    if (path === '/form-sources') data = [{ id: 'source', name: 'Destek Sitesi', enabled: true }];
    if (path === '/skill-catalog') data = { categories: [], levels: [], skills: [] };
    if (path === '/integrations') data = { emailEnabled: true, smtpEnabled: false, imapEnabled: false, imapAuthType: 'PASSWORD', emailNotifications: {} };
    if (path === '/integrations/inbound-warnings') data = { total: 0, items: [] };
    if (path === '/integrations/form') data = { enabled: true, title: 'Destek Talebi', departmentId: null };
    if (path === '/integrations/turnstile') data = { enabled: false, siteKey: '', secretConfigured: false };
    if (path === '/reports') data = { period: { from: '2026-11-01', to: '2026-11-26' }, total: 0, statuses: {}, priorities: {}, departments: [], staff: [], daily: [], firstResponseMinutes: null, resolutionMinutes: null };
    if (path === '/staff-presence') data = { staff: [], idleMinutes: 15 };
    if (path === '/dashboard') data = { total: 8, unassigned: 6, conversationsToday: 1, activeAgents: 1, statuses: { OPEN: 6, CLOSED: 2 } };
    if (path === '/credit-sales/currencies') data = [{ code: 'TRY', name: 'Türk Lirası', rate: '1', rateType: 'ForexSelling', isActive: true, autoUpdate: false, apiUrl: '' }, { code: 'EUR', name: 'Euro', rate: '50', rateType: 'ForexSelling', isActive: true, autoUpdate: true, apiUrl: 'https://example.test' }];
    if (path === '/credit-sales') data = { settings: { enabled: true, currency: 'TRY', unitPrice: '2.50', minCredits: 1, maxCredits: 10000, validityDays: 365 }, plans: [{ id: 'plan', name: 'Teknik Destek Kredi Paketi', description: 'Uzun açıklamalı destek paketi', currency: 'TRY', credits: 100, price: '250', periodMonths: 1, active: true }] };
    if (path === '/credit-sales/payment-settings/gateways') data = { catalog: [], configured: [] };
    if (path === '/credit-sales/payment-settings' || path === '/credit-sales/payment-settings/akbank') data = { provider: 'iyzico', mode: 'sandbox', credentialsConfigured: false, enabled: false, publicUrl: 'https://support.example.test', testedAt: null, lastError: null };
    if (path === '/credit-sales/payment-settings/pending') data = { total: 0, data: [] };
    return route.fulfill({ json: { success: true, data, unreadCount: 7, pagination: { page: 1, limit: 15, total: Array.isArray(data) ? data.length : 0, totalPages: 1 } } });
  });
}

for (const theme of ['light', 'dark']) {
  test(`mobile lists expose complete records and aligned controls in ${theme}`, async ({ page }) => {
    await workspace(page, theme);
    for (const width of [320, 360, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [path, table] of [['/admin/conversations', '.inbox-table-scroll table'], ['/admin/customers', '.customer-list-table'], ['/admin/users', '.users-table']]) {
        await page.goto(path);
        await expect(page.locator(`${table} tbody tr`).first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        if (width <= 600) {
          await expect(page.locator(`${table} tbody tr`).first()).toHaveCSS('display', 'table-row');
          expect((await page.locator(`${table} tbody tr`).first().boundingBox())!.height).toBeLessThan(150);
          const scroll = page.locator(table).locator('..');
          expect(await scroll.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
          await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
          const last = await page.locator(`${table} tbody td`).last().boundingBox();
          const viewport = await scroll.boundingBox();
          expect(last!.x + last!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width + 1);
          await scroll.evaluate(el => { el.scrollLeft = 0; });
          const search = page.locator('main .management-search input').first();
          expect((await search.boundingBox())!.width).toBeGreaterThan(width - 95);
          for (const button of await page.locator('main .customer-search-row > button, main .inbox-delete > button, main .management-actions .icon-button').all()) {
            const box = await button.boundingBox();
            if (box) expect(box.height).toBeGreaterThanOrEqual(40);
          }
        } else if (width === 1440) {
          await expect(page.locator(`${table} tbody tr`).first()).toHaveCSS('display', 'table-row');
        }
        if (width === 390) {
          if (path === '/admin/customers') {
            await page.locator('.customer-list-table .switch input').click();
            await expect(page).toHaveURL(/\/admin\/customers$/);
            await page.getByRole('button', { name: 'Toplu Sil', exact: true }).click();
            const selection = page.getByRole('checkbox', { name: 'Uzun İsimli Örnek Müşteri müşterisini seç' });
            await selection.check();
            await expect(selection).toBeChecked();
            await expect(page).toHaveURL(/\/admin\/customers$/);
            await page.getByRole('button', { name: 'Yeni Müşteri Ekle', exact: true }).click();
            await expect(page.getByRole('dialog')).toBeVisible();
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
            await page.getByRole('button', { name: 'Kapat', exact: true }).click();
          }
          if (path === '/admin/users') {
            await page.getByRole('switch', { name: 'Uzun İsimli Destek Personeli aktif', exact: true }).click();
            await expect(page).toHaveURL(/\/admin\/users$/);
          }
          await page.screenshot({ path: `.local/mobile-${path.split('/').pop()}-${theme}.png`, fullPage: true });
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/admin/conversations');
    await page.locator('.inbox-sort-button').first().click();
    await expect(page).toHaveURL(/sortBy=number/);
    await page.getByRole('button', { name: 'Duruma Göre Filtrele', exact: true }).click();
    await page.getByRole('option', { name: 'Kapalı', exact: true }).click();
    await expect(page).toHaveURL(/status=CLOSED/);
    await page.getByRole('link', { name: '136 numaralı talebi aç' }).click();
    await expect(page).toHaveURL(/\/admin\/conversations\/ticket$/);
  });
}

test('system guide stays concise, covers current tools and uses both sides of screenshots', async ({ page }) => {
  await workspace(page);
  await page.goto('/admin/guide/system');
  await expect(page.locator('.guide-screen-row')).toHaveCount(5);
  await expect(page.locator('.guide-directory-grid')).toContainText('Kredi ve Paketler');
  await expect(page.locator('.guide-directory-grid')).toContainText('Para Birimleri');
  await expect(page.locator('.guide-directory-grid')).toContainText('Ödeme Ayarları');
  await expect(page.locator('.guide-directory-grid')).toContainText('Takvim');
  expect((await page.locator('.guide-flow-section').innerText()).length).toBeLessThan(1500);
  for (const row of await page.locator('.guide-screen-row').all()) {
    await row.scrollIntoViewIfNeeded();
    await row.locator('img').first().evaluate(async (img: HTMLImageElement) => { await img.decode(); });
    expect(await row.locator('.guide-callout-list li p').evaluateAll(items => Math.max(...items.map(item => item.textContent!.length)))).toBeLessThan(160);
  }
  const placement = await page.locator('#phone').evaluate(row => {
    const image = row.querySelector('.guide-screen-media')!.getBoundingClientRect();
    const cards = [...row.querySelectorAll('.guide-callout-list li')].map(card => card.getBoundingClientRect());
    return { beside: cards.some(card => card.x >= image.right && card.y < image.bottom), below: cards.some(card => card.x < image.right && card.y >= image.bottom) };
  });
  expect(placement).toEqual({ beside: true, below: true });
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of ['customers', 'phone']) {
      const image = (await page.locator(`#${id} .guide-screen-media`).boundingBox())!;
      const cards = await page.locator(`#${id} .guide-callout-list li`).evaluateAll(elements => elements.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, bottom: el.getBoundingClientRect().bottom })));
      const belowImage = cards.find(card => Math.abs(card.x - image.x) < 1 && card.y >= image.y + image.height);
      if (belowImage) expect(belowImage.y - image.y - image.height, `${id} at ${width}px`).toBeLessThanOrEqual(16);
      else expect(cards.at(-1)!.y).toBeLessThan(image.y + image.height);
    }
    await page.locator('#customers').screenshot({ path: `.local/guide-customers-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#phone').screenshot({ path: '.local/guide-phone-layout.png' });
  await page.locator('#dashboard .guide-shot-link').click();
  await expect(page.locator('.guide-fullscreen')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.guide-fullscreen')).toHaveCount(0);
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('#phone').screenshot({ path: `.local/guide-phone-${width}.png` });
  }
});

test('management, payment and integration controls fit phone and tablet widths', async ({ page }) => {
  await workspace(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/admin/tags', '/admin/tags/skills', '/admin/departments', '/admin/websites', '/admin/project-guide', '/admin/surveys', '/admin/reports', '/admin/saved-replies', '/admin/settings/currencies', '/admin/settings/payments', '/admin/credit-sales', '/admin/integrations/channels', '/admin/response-time-rules', '/admin/files', '/admin/phone-support']) {
      await test.step(`${path} at ${width}`, async () => {
        await page.goto(path);
        await expect(page.locator('main').first()).toBeVisible();
        await expect(page.locator('main input, main button').first()).toBeVisible();
        await expect(page.locator('main').first()).not.toContainText(/Yükleniyor|yükleniyor/);
        expect(errors, path).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), path).toBe(true);
        const clipped = await page.locator('main .button, main label:has(> .field-label), main .styled-dropdown-trigger').evaluateAll(elements => elements.filter(el => {
          const box = el.getBoundingClientRect();
          return !el.closest('table') && box.width && (box.x < 0 || box.right > innerWidth + 1);
        }).map(el => ({ text: el.textContent, width: el.getBoundingClientRect().width })));
        expect(clipped, path).toEqual([]);
        if (path === '/admin/settings/currencies') {
          const scroller = page.locator('.currency-list-card .management-table-wrap');
          expect(await scroller.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
          await page.screenshot({ path: `.local/currencies-layout-${width}.png`, fullPage: true });
        }
      });
    }
  }
});

test('dashboard legend uses the right side when the card has room', async ({ page }) => {
  await workspace(page);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/admin/dashboard');
    const chart = page.locator('.status-pie');
    await expect(chart.locator('strong')).toHaveText('8');
    const pie = (await chart.boundingBox())!;
    const legend = (await page.locator('.status-chart-legend').boundingBox())!;
    if (width === 320) expect(legend.y).toBeGreaterThanOrEqual(pie.y + pie.height);
    else expect(legend.x).toBeGreaterThanOrEqual(pie.x + pie.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('.status-chart-card').screenshot({ path: `.local/dashboard-legend-${width}.png` });
  }
});
