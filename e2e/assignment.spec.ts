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
    await page.screenshot({ path: '.local/conversation-actions.png', fullPage: true });
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

test('conversation history table preserves messages, actors, attachments and pagination', async ({ page }) => {
  const actor = { id: 'history-admin', name: 'Test Yönetici', email: 'admin@example.test', role: 'ADMIN' };
  const entries = [
    { id: 'reply', action: 'AGENT_REPLY', type: 'AGENT_REPLY', body: 'Talep yanıtlandı.', author: actor, createdAt: '2026-10-05T09:05:00.000Z', metadata: null, attachments: [{ id: 'file-history', originalName: 'rapor.pdf', size: 2048, mimeType: 'application/pdf' }] },
    { id: 'note', action: 'INTERNAL_NOTE', type: 'INTERNAL_NOTE', body: 'İnceleme sürüyor.', author: actor, createdAt: '2026-10-05T09:03:00.000Z', metadata: null, attachments: [] },
    { id: 'update', action: 'conversation.updated', type: 'SYSTEM', body: 'Durum değiştirildi', author: actor, createdAt: '2026-10-05T09:01:00.000Z', metadata: { status: 'RESOLVED' }, attachments: [] },
    { id: 'initial', action: 'INITIAL_MESSAGE', type: 'CUSTOMER_MESSAGE', body: 'Ödeme ekranında hata var.', author: { ...actor, name: 'Test Müşteri' }, createdAt: '2026-10-05T09:00:00.000Z', metadata: null, attachments: [] },
  ];
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { success: true, data: { accessToken: 'history-token', user: actor } } });
    if (path === '/conversations/history-test/history') {
      const secondPage = url.searchParams.get('page') === '2';
      return route.fulfill({ json: { success: true, data: secondPage ? [{ ...entries[3], id: 'older', body: 'Eski kayıt' }] : entries, pagination: { page: secondPage ? 2 : 1, limit: 50, total: 51, totalPages: 2 } } });
    }
    return route.fulfill({ json: { success: true, data: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 100 } } });
  });
  await page.goto('/admin/conversations/history-test/log');
  const table = page.getByRole('table', { name: 'Konuşma işlem geçmişi' });
  await expect(table.getByRole('row')).toHaveCount(5);
  await expect(table.getByRole('columnheader', { name: 'İşlemi yapan' })).toBeVisible();
  await expect(table).toContainText('Talep yanıtlandı.');
  await expect(table).toContainText('İnceleme sürüyor.');
  await expect(table).toContainText('Test Yönetici');
  await expect(table).toContainText('Yanıt süresi: 5 dk');
  await expect(table).toContainText('12:05:00');
  await expect(table).toContainText('Durum: Çözüldü');
  await expect(table.getByRole('button', { name: /rapor.pdf/ })).toBeVisible();
  await page.screenshot({ path: '.local/conversation-history-table.png', fullPage: true });
  await page.getByRole('button', { name: 'Gece moduna geç' }).click();
  await page.screenshot({ path: '.local/conversation-history-table-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Sonraki', exact: true }).click();
  await expect(table).toContainText('Eski kayıt');
  await expect(table.getByRole('row')).toHaveCount(2);
});
