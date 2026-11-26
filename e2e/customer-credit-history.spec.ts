import { test, expect } from '@playwright/test';

for (const hasPeople of [false, true]) {
  test('customer credit history ' + (hasPeople ? 'offers company views' : 'stays simple without linked people'), async ({ page }) => {
    const company = { id: 'customer', name: 'Company owner', company: 'Company', parentCustomerId: null };
    const child = { id: 'person', name: 'Linked person' };
    const queries: URL[] = [];
    await page.route('**/api/v1/**', async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      let data: unknown = [];
      if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { ...company, role: 'CUSTOMER' } };
      if (path.endsWith('/public/license')) data = { enabled: false, valid: true };
      if (path.endsWith('/customers/customer/agreements')) data = { customer: company, parent: null, children: hasPeople ? [child] : [], agreements: [], charges: [], availableCredits: 100 };
      if (path.endsWith('/credit-history')) {
        queries.push(url);
        const peopleView = url.searchParams.get('view') === 'people';
        data = peopleView ? [{ ...child, ticketCount: 2, spent: 30, returned: 0, net: 30 }] : [{ id: 'charge', createdAt: '2026-11-26T09:00:00Z', kind: 'USED', credits: 30, agreement: { id: 'grant', name: 'Package' }, conversation: { id: 'ticket', number: 10, subject: 'Support', customer: child } }];
        return route.fulfill({ json: { success: true, data, people: [company, child], agreements: [], summary: { spent: 30, returned: 0, net: 30, tickets: 2 }, pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
      }
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/customer/agreements?view=history');
    if (hasPeople) {
      await expect(page.getByRole('button', { name: 'Kredi kişisi', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Kişilere göre kullanım', exact: true }).click();
      await expect(page.getByRole('table', { name: 'Kişilere göre kredi kullanımı' })).toBeVisible();
      await page.getByRole('button', { name: child.name, exact: true }).click();
      await expect.poll(() => queries.at(-1)?.searchParams.get('personId')).toBe(child.id);
      await expect(page.getByRole('table', { name: 'Kredi Hareketleri', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Excel indir', exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByRole('table', { name: 'Kredi Hareketleri', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Kredi kişisi', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Kişilere göre kullanım', exact: true })).toHaveCount(0);
      await expect(page.locator('.credit-log-footer')).toContainText('1 kullanım');
      const table = await page.getByRole('table', { name: 'Kredi Hareketleri', exact: true }).boundingBox();
      const count = await page.locator('.credit-log-footer').boundingBox();
      expect(count!.y).toBeGreaterThan(table!.y + table!.height);
    }
  });
}
