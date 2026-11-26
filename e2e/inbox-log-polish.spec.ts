import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  test(`inbox, logs and credit values share the standard presentation in ${theme}`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('helpdesk-theme', theme), theme);
    let role = 'ADMIN';
    const searches: string[] = [];
    const longEmail = 'verylongunbrokentext'.repeat(30) + '@example.test';
    const conversation = { id: 'ticket', number: 129, subject: 'Örnek destek talebi', channel: 'EMAIL', status: 'CLOSED', priority: 'NORMAL', customer: { id: 'customer', name: 'Örnek Müşteri' }, department: { id: 'department', name: 'Genel Destek' }, assignedAgent: null, assignees: [], tags: [], createdAt: '2026-11-20T09:00:00Z', updatedAt: '2026-11-20T10:00:00Z', creditCharge: { credits: 10 } };
    await page.route('**/socket.io/**', route => route.abort());
    await page.route('**/api/v1/**', route => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace('/api/v1', '');
      let data: unknown = [];
      if (path === '/auth/refresh') data = { accessToken: 'test', user: { id: 'customer', name: 'Örnek Kullanıcı', role } };
      if (path === '/auth/security') data = { enabled: false };
      if (path === '/public/license') data = { enabled: false, valid: true, status: 'DISABLED' };
      if (path === '/conversations') { searches.push(url.searchParams.get('search') ?? ''); data = [conversation]; }
      if (path === '/activity-logs') data = [{ id: 'log', action: 'customer.deleted', createdAt: '2026-11-20T10:00:00Z', actor: { name: 'Yönetici', email: 'admin@example.test' }, metadata: { name: 'Örnek Müşteri', email: longEmail, deletedConversationCount: 3 } }];
      if (path === '/reports') data = { period: { from: '2026-11-01', to: '2026-11-26' }, total: 0, statuses: {}, priorities: {}, departments: [], staff: [], daily: [], firstResponseMinutes: null, resolutionMinutes: null };
      if (path === '/reports/credit-usage') data = [{ id: 'credit', credits: 10, createdAt: conversation.createdAt, actor: { id: 'staff', name: 'Örnek Personel' }, agreement: { name: 'Destek Paketi' }, conversation }];
      return route.fulfill({ json: { success: true, data, totalCredits: 10, staff: [], unreadCount: 25, pagination: { page: 1, limit: 20, total: Array.isArray(data) ? data.length : 0, totalPages: 1 } } });
    });
    await page.goto('/admin/conversations');
    const search = page.getByRole('searchbox', { name: 'Taleplerde Ara' });
    await expect(search.locator('..')).toHaveClass('management-search');
    await expect(search.locator('..').locator('.field-label')).toHaveText('Ara');
    await search.fill('örnek');
    await expect.poll(() => searches.includes('örnek')).toBe(true);
    await expect(page.locator('.inbox-delete')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await page.getByRole('button', { name: 'Talepleri Sil', exact: true }).click();
    await expect(page.locator('.inbox-delete [role=menu]')).toBeVisible();
    await page.getByRole('button', { name: 'Talepleri Sil', exact: true }).click();
    await expect(page.locator('.notification-count')).toHaveCSS('border-top-width', '0px');
    const credit = page.locator('.inbox-credit-cell .ticket-credit-pill');
    await expect(credit).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(credit).toHaveCSS('border-top-width', '0px');
    await expect(credit.locator('strong')).toHaveCSS('color', theme === 'dark' ? 'rgb(251, 146, 60)' : 'rgb(180, 83, 9)');

    await page.goto('/admin/activity-logs');
    await expect(page.locator('.activity-history-table')).toContainText(longEmail);
    for (const width of [1440, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.locator('.activity-log-scroll').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await expect(page.locator('td[data-label="Açıklama"]')).toHaveCSS('white-space', 'normal');
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/admin/reports');
    for (const selector of ['.report-credit-total', '.report-credit-count', '.report-credit-amount']) {
      await expect(page.locator(selector)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(page.locator(selector)).toHaveCSS('border-top-width', '0px');
    }
    await expect(page.locator('.report-credit-total .credit-value')).toHaveText('10');
    role = 'CUSTOMER';
    await page.goto('/customer/tickets');
    await expect(page.getByRole('searchbox', { name: 'Taleplerde Ara' }).locator('..')).toHaveClass('management-search');
  });
}
