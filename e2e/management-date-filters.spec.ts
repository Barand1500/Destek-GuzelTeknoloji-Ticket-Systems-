import { test, expect, type Page } from '@playwright/test';

const subscription = (id: string, name: string, status: string) => ({
  id, name, amount: '10.00', currency: 'TRY', credits: 100, periodMonths: 1, periodDays: null,
  status, lastOrderStatus: 'PAID', currentStartsOn: '2026-01-01', currentEndsOn: '2026-12-31',
  customer: { name: 'Yunus Durgun', company: 'Yunus' },
});

async function setup(page: Page) {
  const subscriptionQueries: URLSearchParams[] = [];
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const send = (data: unknown, pagination = { total: Array.isArray(data) ? data.length : 0, page: 1, totalPages: 1, limit: 20 }) =>
      route.fulfill({ json: { success: true, data, pagination } });
    if (path === '/auth/refresh') return send({ accessToken: 'test', user: { id: 'staff', name: 'Personel', role: 'ADMIN' } });
    if (path === '/auth/security') return send({ enabled: false });
    if (path === '/credit-sales') return send({ settings: { alertsEnabled: false, lowCreditPercent: 20, expiryNoticeDays: 7, currency: 'TRY', enabled: true, unitPrice: '1.00', minCredits: 1, maxCredits: 10000, validityDays: 365 }, plans: [] });
    if (path === '/credit-sales/subscriptions') {
      subscriptionQueries.push(url.searchParams);
      const pageNumber = Number(url.searchParams.get('page') ?? 1);
      return send([subscription('sub-' + pageNumber, 'başlangıç planı', 'ACTIVE')], { total: 45, page: pageNumber, totalPages: 3, limit: Number(url.searchParams.get('limit') ?? 20) });
    }
    if (path === '/activity-logs') return send([]);
    return send([]);
  });
  return { subscriptionQueries };
}

test('subscriptions screen filters by package status and page size like orders', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/admin/credit-sales?view=subscriptions');
  const filters = page.locator('.credit-orders-filters');
  await expect(filters.getByRole('button', { name: 'Abonelik durum filtresi', exact: true })).toBeVisible();
  await expect(filters.getByRole('button', { name: 'Abonelik sayfa başına kayıt sayısı', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Abonelik Listesi', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Sayfalama', exact: true })).toContainText('45 kayıt · Sayfa 1 / 3');

  await filters.getByRole('button', { name: 'Abonelik durum filtresi', exact: true }).click();
  await page.getByRole('option', { name: 'Kısmi iade', exact: true }).click();
  await expect.poll(() => state.subscriptionQueries.at(-1)?.get('displayStatus')).toBe('partial_refund');
  await expect.poll(() => state.subscriptionQueries.at(-1)?.get('page')).toBe('1');

  await page.getByRole('navigation', { name: 'Sayfalama', exact: true }).getByRole('button', { name: 'Sonraki', exact: true }).click();
  await expect.poll(() => state.subscriptionQueries.at(-1)?.get('page')).toBe('2');

  await filters.getByRole('button', { name: 'Abonelik sayfa başına kayıt sayısı', exact: true }).click();
  await page.getByRole('option', { name: '50', exact: true }).click();
  await expect.poll(() => state.subscriptionQueries.at(-1)?.get('limit')).toBe('50');
});

test('activity log picks a single day or a date range from one calendar', async ({ page }) => {
  const queries: URLSearchParams[] = [];
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    const send = (data: unknown) => route.fulfill({ json: { success: true, data, pagination: { total: Array.isArray(data) ? data.length : 0, page: 1, totalPages: 1, limit: 15 } } });
    if (path === '/auth/refresh') return send({ accessToken: 'test', user: { id: 'staff', name: 'Personel', role: 'ADMIN' } });
    if (path === '/auth/security') return send({ enabled: false });
    if (path === '/activity-logs') {
      queries.push(url.searchParams);
      const filtered = url.searchParams.has('from');
      return send([
        { id: 'log-1', createdAt: '2026-11-12T09:00:00.000Z', action: 'conversation.updated', metadata: { subject: 'Aralık içi' }, user: { name: 'Yunus Durgun', email: 'yunus@example.test' } },
        ...(filtered ? [] : [{ id: 'log-2', createdAt: '2026-11-20T09:00:00.000Z', action: 'conversation.updated', metadata: { subject: 'Aralık dışı' }, user: { name: 'Yunus Durgun', email: 'yunus@example.test' } }]),
      ]);
    }
    return send([]);
  });
  await page.goto('/admin/activity-logs');
  const rows = page.locator('.activity-history-table tbody tr');
  await expect(rows).toHaveCount(2);
  const trigger = page.getByRole('button', { name: 'Tarih seç', exact: true });
  await expect(trigger).toContainText('Gün veya aralık seç');

  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Tarih takvimi', exact: true });
  await expect(calendar).toBeVisible();
  await calendar.getByRole('button', { name: '12 Kasım 2026', exact: true }).click();
  await expect(calendar).toContainText('Bitiş gününü seçin');
  await calendar.getByRole('button', { name: '20 Kasım 2026', exact: true }).click();
  await expect(calendar).toBeHidden();
  await expect(trigger).toContainText('12.11.2026 – 20.11.2026');
  await expect.poll(() => queries.at(-1)?.get('from')).toBe('2026-11-12');
  await expect.poll(() => queries.at(-1)?.get('to')).toBe('2026-11-20');
  await expect(rows).toHaveCount(1);

  await trigger.click();
  await calendar.getByRole('button', { name: '18 Kasım 2026', exact: true }).click();
  await calendar.getByRole('button', { name: '18 Kasım 2026', exact: true }).click();
  await expect(calendar).toBeHidden();
  await expect(trigger).toContainText('18.11.2026');
  await expect.poll(() => queries.at(-1)?.get('from')).toBe('2026-11-18');
  await expect.poll(() => queries.at(-1)?.get('to')).toBe('2026-11-18');

  await trigger.click();
  await calendar.getByRole('button', { name: 'Temizle', exact: true }).click();
  await expect(trigger).toContainText('Gün veya aralık seç');
  await expect(rows).toHaveCount(2);
});
