import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`shared controls stay transparent across admin screens in ${theme}`, async ({ page }) => {
    const errors: string[] = [];
    const searches: string[] = [];
    let euroActive = true;
    const writes: { path: string; body: any }[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => localStorage.setItem('helpdesk-theme', theme), theme);
    await page.route('**/socket.io/**', route => route.abort());
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v1', '');
      searches.push(url.searchParams.get('search') ?? '');
      let data: unknown = [];
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        writes.push({ path, body });
        if (path === '/credit-sales/currencies') euroActive = body.isActive;
      }
      if (path === '/auth/refresh') data = { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } };
      if (path === '/auth/security') data = { enabled: false };
      if (path === '/integrations') data = { emailEnabled: true, smtpEnabled: false, imapEnabled: false, imapAuthType: 'PASSWORD', emailNotifications: {} };
      if (path === '/integrations/inbound-warnings') data = { total: 0, items: [] };
      if (path === '/skill-catalog') data = { categories: [], levels: [], skills: [] };
      if (path === '/integrations/turnstile') data = { enabled: false, siteKey: 'test-site-key', secretConfigured: true, secretLength: 16 };
      if (path === '/integrations/form') data = { enabled: true, title: 'Destek Talebi', departmentId: null };
      if (path === '/reports') data = { period: { from: '2026-11-01', to: '2026-11-26' }, total: 0, statuses: {}, priorities: {}, departments: [], staff: [], daily: [], firstResponseMinutes: null, resolutionMinutes: null };
      if (path === '/reports/credit-usage') return route.fulfill({ json: { success: true, data: [], totalCredits: 0, pagination: { total: 0, page: 1, limit: 20, totalPages: 1 } } });
      if (path === '/credit-sales/currencies') data = [
        { code: 'TRY', name: 'Türk Lirası', rate: '1', rateType: 'ForexSelling', isActive: true, autoUpdate: false, apiUrl: '' },
        { code: 'EUR', name: 'Euro', rate: '50', rateType: 'ForexSelling', isActive: euroActive, autoUpdate: false, apiUrl: 'https://example.test/rates' },
      ];
      return route.fulfill({ json: { success: true, data, pagination: { total: Array.isArray(data) ? data.length : 0, page: 1, limit: 15, totalPages: 1 } } });
    });

    const screens = [
      ['/admin/tags', '.management-search'],
      ['/admin/tags/skills', '.management-search'],
      ['/admin/users', '.management-search'],
      ['/admin/customers', '.management-search'],
      ['/admin/websites', '.management-search'],
      ['/admin/settings/currencies', '.credit-orders-search'],
      ['/admin/files', '.files-search'],
      ['/admin/phone-support', '.phone-support-search'],
      ['/admin/conversations', '.filters > .management-search'],
      ['/admin/integrations/channels', '.integration-fields'],
      ['/admin/reports', '.report-credit-search'],
    ];
    for (const [path, selector] of screens) {
      await test.step(path, async () => {
        await page.goto(path);
        await expect(page.locator(selector).first()).toBeVisible();
        const opaque = await page.locator('.app-shell').evaluate(root => {
          const selector = 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=color]):not([type=file]), textarea, select, label:has(> .field-label), .styled-dropdown, .styled-dropdown-trigger, .files-search, .search-box';
          return [...root.querySelectorAll(selector)].filter(el => el.getClientRects().length && getComputedStyle(el).backgroundColor !== 'rgba(0, 0, 0, 0)').map(el => ({ tag: el.tagName, class: el.className, color: getComputedStyle(el).backgroundColor }));
        });
        expect(opaque, path).toEqual([]);
        const mismatchedLabels = await page.locator('.app-shell .field-label:visible, .app-shell .styled-dropdown-label:visible').evaluateAll(labels => labels.flatMap(label => {
          let ancestor = label.parentElement;
          while (ancestor && getComputedStyle(ancestor).backgroundColor === 'rgba(0, 0, 0, 0)') ancestor = ancestor.parentElement;
          const actual = getComputedStyle(label).backgroundColor;
          const expected = ancestor && getComputedStyle(ancestor).backgroundColor;
          return actual === expected ? [] : [{ label: label.textContent, actual, expected }];
        }));
        expect(mismatchedLabels, path).toEqual([]);
        const labels = page.locator(`${selector} .field-label`);
        if (selector !== '.integration-fields' && await labels.count()) await expect(labels.first()).toHaveText('Ara');
        if (path === '/admin/tags') {
          await page.locator('.management-search input').fill('test');
          await expect.poll(() => searches.includes('test')).toBe(true);
          const dropdown = page.locator('.management-page-size .styled-dropdown-trigger');
          await dropdown.click();
          const menu = page.locator('.management-page-size .styled-dropdown-menu');
          await expect(menu).toBeVisible();
          await expect(menu).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await menu.getByRole('option', { name: '20', exact: true }).click();
          await expect(dropdown).toHaveText('20');
          if (theme === 'dark') await page.screenshot({ path: 'output/shared-controls-categories.png' });
        }
        if (path === '/admin/settings/currencies') {
          await expect(page.locator('.currency-search-toolbar').locator('xpath=..')).not.toHaveClass(/credit-sales-card/);
          await expect(page.getByRole('switch', { name: 'Türk Lirası aktif' })).toBeDisabled();
          const toggle = page.getByRole('switch', { name: 'Euro aktif' });
          await expect(toggle).toBeChecked();
          await toggle.click();
          await expect.poll(() => writes.some(write => write.path === '/credit-sales/currencies' && write.body.code === 'EUR' && write.body.isActive === false)).toBe(true);
          await expect(toggle).not.toBeChecked();
          await expect(page.locator('.currency-list-card .status-CLOSED').first()).toHaveCSS('background-color', theme === 'dark' ? 'rgb(48, 65, 76)' : 'rgb(239, 242, 239)');
          const field = page.getByRole('textbox', { name: 'Para birimi ara' });
          const box = await page.locator('.currency-search-toolbar label').boundingBox();
          const toolbar = await page.locator('.currency-search-toolbar').boundingBox();
          expect(box!.width).toBeLessThanOrEqual(321);
          expect(Math.abs(box!.x + box!.width - toolbar!.x - toolbar!.width)).toBeLessThan(2);
          await field.fill('Euro');
          await expect(page.getByRole('cell', { name: 'Euro', exact: true })).toBeVisible();
          await expect(page.getByRole('cell', { name: 'Türk Lirası', exact: true })).toHaveCount(0);
          await page.setViewportSize({ width: 390, height: 844 });
          await expect(field).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.setViewportSize({ width: 1440, height: 1000 });
          if (theme === 'dark') await page.screenshot({ path: 'test-results/currency-controls-dark.png' });
        }
        if (path === '/admin/tags/skills') {
          await expect(page.getByRole('link', { name: 'Personel Yetenekleri', exact: true })).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Kategori Ekle', exact: true }).locator('svg')).toHaveCount(0);
          await page.getByRole('button', { name: 'Yetenekler', exact: true }).click();
          await expect(page.getByRole('heading', { name: 'Yetenek Ekle', exact: true }).locator('svg')).toHaveCount(0);
        }
        if (path === '/admin/users') {
          await expect(page.locator('.staff-skills-heading > svg')).toHaveCSS('color', theme === 'dark' ? 'rgb(142, 213, 245)' : 'rgb(8, 107, 152)');
        }
        if (path === '/admin/integrations/channels') {
          await expect(page.locator('.integration-toggle:visible').filter({ hasText: 'SSL/TLS Kullan' })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await page.getByRole('tab', { name: 'Form', exact: true }).click();
          const border = await page.getByRole('textbox', { name: 'Form Başlığı', exact: true }).locator('xpath=..').evaluate(el => getComputedStyle(el).borderColor);
          await expect(page.locator('.form-required-fields')).toHaveCSS('border-color', border);
          await page.getByRole('tab', { name: 'Cloudflare', exact: true }).click();
          const toggle = page.getByRole('switch', { name: 'Doğrulamayı Etkinleştir', exact: true });
          await toggle.check();
          if (theme === 'dark') await page.screenshot({ path: 'test-results/cloudflare-toggle-dark.png' });
          await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
          await expect.poll(() => writes.some(write => write.path === '/integrations/turnstile' && write.body.enabled === true)).toBe(true);
        }
      });
    }
    expect(errors).toEqual([]);
  });
}
