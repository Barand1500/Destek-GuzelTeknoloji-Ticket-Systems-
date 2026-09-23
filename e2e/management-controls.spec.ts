import { test, expect } from '@playwright/test';

for (const kind of ['users', 'departments'] as const) {
  test(`${kind}: status switch and delete are separate actions`, async ({ page }) => {
    const record = { id: 'fixture-record', name: kind === 'users' ? 'Test Personel' : 'Test Departman', isActive: true, email: 'fixture@example.test', role: 'AGENT', departments: [] };
    let removed = false;
    let deletions = 0;
    const empty = { success: true, data: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 0 } };
    await page.route('**/socket.io/**', route => route.abort());
    await page.route('**/api/v1/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace('/api/v1', '');
      if (path === '/auth/refresh') return route.fulfill({ json: { success: true, data: { accessToken: 'test-token', user: { id: 'admin-test', name: 'Admin', role: 'ADMIN' } } } });
      if (path === `/${kind}/${record.id}`) {
        if (request.method() === 'PATCH') record.isActive = request.postDataJSON().isActive;
        if (request.method() === 'DELETE') { removed = true; deletions++; }
        return route.fulfill({ json: { success: true, data: record } });
      }
      if (path === `/${kind}`) return route.fulfill({ json: { ...empty, data: removed ? [] : [record], pagination: { page: 1, limit: 15, total: removed ? 0 : 1, totalPages: removed ? 0 : 1 } } });
      if (path === '/dashboard') return route.fulfill({ json: { success: true, data: { statuses: {}, total: 0, unassigned: 0 } } });
      return route.fulfill({ json: empty });
    });
    await page.goto(`/admin/${kind}`);
    const toggle = page.getByRole('switch', { name: `${record.name} aktif` });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByRole('row').filter({ hasText: record.name }).getByText('Pasif', { exact: true })).toBeVisible();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.getByRole('button', { name: 'Sil', exact: true }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Vazgeç' }).click();
    expect(deletions).toBe(0);
    await page.getByRole('button', { name: 'Sil', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sil', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(toggle).toHaveCount(0);
    expect(deletions).toBe(1);
  });
}
