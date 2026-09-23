import { test, expect } from '@playwright/test';

test('assigned staff name is visible before the department directory arrives', async ({ page }) => {
  const staff = { id: '20ae2765-3099-4a68-aa4e-000000000001', name: 'Muhasebe Personeli', role: 'SUPERVISOR', email: 'staff@example.test' };
  const customer = { id: 'customer-test', name: 'Test Müşteri', role: 'CUSTOMER', email: 'customer@example.test' };
  const conversation = { id: 'assignment-test', number: 1, subject: 'Atama görünümü testi', channel: 'TICKET', status: 'OPEN', priority: 'NORMAL', customer, customerId: customer.id, assignedAgent: staff, assignedAgentId: staff.id, department: { id: 'accounting-test', name: 'Muhasebe' }, departmentId: 'accounting-test', tags: [], createdAt: '2026-09-22T14:18:00.000Z' };
  const empty = { success: true, data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } };
  let releaseDirectory!: () => void;
  const directoryReady = new Promise<void>(resolve => { releaseDirectory = resolve; });
  let writes = 0;
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { success: true, data: { accessToken: 'test-token', user: { id: 'admin-test', name: 'Test Admin', role: 'ADMIN', email: 'admin@example.test' } } } });
    if (route.request().method() !== 'GET') writes++;
    if (path === '/conversations/assignment-test') return route.fulfill({ json: { success: true, data: conversation } });
    if (path === '/departments/accounting-test/agents') {
      await directoryReady;
      return route.fulfill({ json: { ...empty, data: [staff] } });
    }
    if (path === '/status-options') {
      await directoryReady;
      return route.fulfill({ json: { ...empty, data: [{ id: 'open', code: 'OPEN', name: 'Yeni kayıt' }] } });
    }
    if (path === '/dashboard') return route.fulfill({ json: { success: true, data: { statuses: {}, total: 0, unassigned: 0 } } });
    return route.fulfill({ json: empty });
  });
  try {
    await page.goto('/admin/conversations/assignment-test');
    await expect(page.getByRole('textbox', { name: 'Atanan personel', exact: true })).toHaveValue(staff.name);
    releaseDirectory();
    await expect(page.getByRole('textbox', { name: 'Durum', exact: true })).toHaveValue('Yeni kayıt');
    await expect(page.getByRole('textbox', { name: 'Atanan personel', exact: true })).toHaveValue(staff.name);
    assertNoWrites();
    await page.getByRole('button', { name: 'Görüşmeyi sil', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Görüşmeyi sil', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Atama görünümü testi', { exact: true })).toBeVisible();
    await expect(page.locator('.ticket-properties').getByRole('dialog')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Vazgeç' }).click();
    await expect(dialog).toHaveCount(0);
    assertNoWrites();
  } finally {
    releaseDirectory();
  }
  function assertNoWrites() { expect(writes).toBe(0); }
});
