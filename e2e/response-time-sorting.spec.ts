import { test, expect } from '@playwright/test';

test('response time cycles shortest, longest, default and resets the page', async ({ page }) => {
  const requests: URL[] = [];
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/refresh')) return route.fulfill({ json: { data: { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } } } });
    const isList = url.pathname.endsWith('/conversations');
    if (isList) requests.push(url);
    const row = { id: 'ticket', number: 1, subject: 'Test', channel: 'EMAIL', status: 'OPEN', priority: 'NORMAL', customer: { id: 'customer', name: 'Customer' }, department: { id: 'department', name: 'Support' }, assignedAgent: null, tags: [], createdAt: '2026-10-20T06:00:00Z', updatedAt: '2026-10-20T06:00:00Z' };
    return route.fulfill({ json: { success: true, data: isList ? [row] : [], pagination: { page: 1, limit: 15, total: isList ? 1 : 0, totalPages: 1 } } });
  });
  await page.goto('/admin/conversations?page=2');
  const button = page.getByRole('button', { name: 'YANIT SÜRESİ', exact: true });
  const header = page.getByRole('columnheader').filter({ has: button });
  await expect(button).toBeVisible();
  await button.click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
  await expect.poll(() => requests.at(-1)?.searchParams.get('sortBy')).toBe('responseTime');
  expect(requests.at(-1)?.searchParams.get('sortDirection')).toBe('asc');
  await expect(page).not.toHaveURL(/page=2/);
  await button.click();
  await expect(header).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(() => requests.at(-1)?.searchParams.get('sortDirection')).toBe('desc');
  await button.click();
  await expect(header).toHaveAttribute('aria-sort', 'none');
  await expect.poll(() => requests.at(-1)?.searchParams.has('sortBy')).toBe(false);
  await button.click();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(header).toHaveAttribute('aria-sort', 'none');
  await expect.poll(() => requests.at(-1)?.searchParams.get('sortBy')).toBe('number');
});
