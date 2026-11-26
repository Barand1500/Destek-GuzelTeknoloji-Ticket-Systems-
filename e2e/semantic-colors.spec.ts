import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`default palette stays consistent and custom colors remain editable in ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('helpdesk-theme', theme), theme);
    const rules = { responseFastFromMinutes: 0, responseFastToMinutes: 15, responseNormalFromMinutes: 16, responseNormalToMinutes: 30, responseLateFromMinutes: 31, responseLateToMinutes: 1440, responseFastColor: '#16715d', responseNormalColor: '#a86606', responseLateColor: '#c2413c' };
    let saved: any;
    await page.route('**/socket.io/**', route => route.abort());
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
      let data: unknown = [];
      if (path === '/auth/refresh') data = { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } };
      if (path === '/auth/security') data = { enabled: false };
      if (path === '/response-time-settings') {
        if (route.request().method() === 'PUT') saved = route.request().postDataJSON();
        data = saved ?? rules;
      }
      if (path === '/status-options') data = [
        { id: 'open', code: 'OPEN', name: 'Açık', color: '#2f8f73', isActive: true },
        { id: 'pending', code: 'PENDING', name: 'Beklemede', color: '#d49a2a', isActive: true },
        { id: 'custom', code: 'CUSTOM', name: 'Özel', color: '#123456', isActive: true },
      ];
      if (path === '/priority-options') data = [
        { id: 'high', code: 'HIGH', name: 'Yüksek', color: '#dd7a2d', isActive: true },
        { id: 'urgent', code: 'URGENT', name: 'Acil', color: '#c94b4b', isActive: true },
      ];
      return route.fulfill({ json: { success: true, data, pagination: { page: 1, total: Array.isArray(data) ? data.length : 0, totalPages: 1, limit: 15 } } });
    });
    await page.goto('/admin/response-time-rules');
    await expect(page.locator('input[name=responseFastColor]')).toHaveValue('#2f8f73');
    await expect(page.locator('input[name=responseNormalColor]')).toHaveValue('#fb923c');
    await expect(page.locator('input[name=responseLateColor]')).toHaveValue('#c94b4b');
    await page.locator('input[name=responseNormalColor]').evaluate((input: HTMLInputElement) => { input.value = '#123456'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.getByRole('button', { name: 'Kuralları Kaydet', exact: true }).click();
    await expect.poll(() => saved?.responseNormalColor).toBe('#123456');
    expect(saved.responseNormalFromMinutes).toBe(16);
    expect(saved.responseLateToMinutes).toBe(1440);
    await page.reload();
    await expect(page.locator('input[name=responseNormalColor]')).toHaveValue('#123456');

    await page.goto('/admin/tags');
    await page.getByRole('button', { name: 'Durumlar', exact: true }).click();
    const row = (name: string) => page.locator('.catalog-table tbody tr').filter({ hasText: name });
    await expect(row('Açık').locator('.management-swatch')).toHaveCSS('background-color', 'rgb(47, 143, 115)');
    await expect(row('Beklemede').locator('.management-swatch')).toHaveCSS('background-color', 'rgb(251, 146, 60)');
    await row('Özel').click();
    await expect(page.locator('input[name=color]')).toHaveValue('#123456');
    await page.getByRole('button', { name: 'Öncelikler', exact: true }).click();
    await expect(row('Yüksek').locator('.management-swatch')).toHaveCSS('background-color', 'rgb(251, 146, 60)');
    await expect(row('Acil').locator('.management-swatch')).toHaveCSS('background-color', 'rgb(201, 75, 75)');

    await page.goto('/admin/websites');
    await expect(page.locator('.field-warning-icon')).toHaveCSS('color', theme === 'dark' ? 'rgb(251, 146, 60)' : 'rgb(180, 83, 9)');
  });
}
