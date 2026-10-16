import { test, expect } from '@playwright/test';

test('inbox shows current channels vertically instead of the original channel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const user = { id: 'admin', name: 'Test Yönetici', email: 'test@example.test', role: 'ADMIN', departmentIds: [] };
  const base = { customer: { id: 'customer', name: 'Test Müşteri', email: 'customer@example.test', role: 'CUSTOMER' }, department: { id: 'department', name: 'Test Departman' }, assignedAgent: null, channel: 'WHATSAPP', status: 'OPEN', priority: 'NORMAL', tags: [], createdAt: '2026-10-15T10:00:00Z', updatedAt: '2026-10-15T10:00:00Z' };
  const rows = [
    { ...base, id: 'changed', number: 12, subject: 'Sadece E-Posta', replyChannels: ['EMAIL'] },
    { ...base, id: 'multi', number: 13, subject: 'Birden fazla kanal', replyChannels: ['WHATSAPP', 'EMAIL'] },
    { ...base, id: 'legacy', number: 14, subject: 'Eski kayıt', replyChannels: null },
  ];
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth/refresh')) return route.fulfill({ json: { success: true, data: { user, accessToken: 'test-token' } } });
    return route.fulfill({ json: { success: true, data: pathname.endsWith('/conversations') ? rows : [], pagination: { page: 1, limit: 15, total: pathname.endsWith('/conversations') ? rows.length : 0, totalPages: 1 } } });
  });
  await page.goto('/admin/conversations');
  const lists = page.locator('.inbox-channel-list');
  await expect(lists).toHaveCount(3);
  await expect(lists.nth(0)).toHaveText('E-Posta');
  await expect(lists.nth(0).getByText('WhatsApp')).toHaveCount(0);
  await expect(lists.nth(1).locator('.management-pill')).toHaveText(['WhatsApp', 'E-Posta']);
  await expect(lists.nth(2)).toHaveText('WhatsApp');
  const stacked = await lists.nth(1).locator('.management-pill').evaluateAll(items => items[1].getBoundingClientRect().top >= items[0].getBoundingClientRect().bottom);
  expect(stacked).toBe(true);
  expect(errors).toEqual([]);
});

test('No is the first column and cycles numeric ascending, descending and default independently', async ({ page }) => {
  const user = { id: 'admin', name: 'Test Yönetici', email: 'test@example.test', role: 'ADMIN', departmentIds: [] };
  const rows = [20, 2, 10].map(number => ({ id: `ticket-${number}`, number, subject: `Talep ${number}`, customer: { id: 'customer', name: 'Test Müşteri' }, department: { id: 'department', name: 'Destek' }, assignedAgent: null, channel: 'EMAIL', status: 'OPEN', priority: 'NORMAL', tags: [], createdAt: '2026-10-15T10:00:00Z', updatedAt: '2026-10-15T10:00:00Z' }));
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/refresh')) return route.fulfill({ json: { success: true, data: { user, accessToken: 'test-token' } } });
    const sorted = url.searchParams.get('sortBy') === 'number' ? [...rows].sort((a, b) => (url.searchParams.get('sortDirection') === 'desc' ? -1 : 1) * (a.number - b.number)) : rows;
    return route.fulfill({ json: { success: true, data: url.pathname.endsWith('/conversations') ? sorted : [], pagination: { page: 1, limit: 15, total: url.pathname.endsWith('/conversations') ? rows.length : 0, totalPages: 1 } } });
  });
  await page.goto('/admin/conversations');
  const table = page.locator('.inbox-table-scroll table');
  const no = table.getByRole('button', { name: 'No', exact: true });
  const firstNumber = table.locator('tbody tr:first-child td:first-child');
  await expect(table.locator('thead th:first-child')).toContainText('No');
  await expect(firstNumber).toHaveText('#TK-00020');
  await no.click(); await expect(firstNumber).toHaveText('#TK-00002');
  await expect(no).toHaveAttribute('title', 'Büyükten küçüğe sırala');
  await no.click(); await expect(firstNumber).toHaveText('#TK-00020');
  await expect(table.locator('thead th:first-child')).toHaveAttribute('aria-sort', 'descending');
  await no.click(); await expect(table.locator('thead th:first-child')).toHaveAttribute('aria-sort', 'none');
  await expect(page).not.toHaveURL(/sortBy=/);
  await no.click();
  await table.getByRole('button', { name: 'TALEP', exact: true }).click();
  await expect(table.locator('thead th:first-child')).toHaveAttribute('aria-sort', 'none');
  await expect(table.locator('thead th:nth-child(2)')).toHaveAttribute('aria-sort', 'ascending');
  await table.getByRole('button', { name: 'Varsayılan Sıralamaya Dön', exact: true }).click();
  await expect(table.locator('th[aria-sort="ascending"], th[aria-sort="descending"]')).toHaveCount(0);
  await expect(firstNumber).toHaveText('#TK-00020');
  await expect(table.locator('tbody tr:first-child td:nth-child(2)')).not.toContainText('#TK-');
});
