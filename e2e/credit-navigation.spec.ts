import { test, expect } from '@playwright/test';
test('customer navigation clears subscription-only orders and exposes the active filter', async ({ page }) => {
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    let data: any = [];
    if (url.pathname.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'customer', name: 'Customer', role: 'CUSTOMER' } };
    if (url.pathname.endsWith('/customers/customer/agreements')) data = { customer: { id: 'customer', name: 'Customer' }, parent: null, children: [], agreements: [], charges: [], availableCredits: 100 };
    if (url.pathname.endsWith('/orders')) {
      data = [18, ...(url.searchParams.has('subscriptionId') ? [] : [9])].map(number => ({ id: String(number), number, name: 'Package ' + number, kind: 'SUBSCRIPTION', periodMonths: 1, credits: 100, total: '1.00', currency: 'TRY', status: 'PAID', createdAt: new Date().toISOString() }));
      return route.fulfill({ json: { success: true, data, pagination: { total: data.length, page: 1, limit: 20, totalPages: 1 } } });
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/customer/agreements?view=orders&subscriptionId=sub-18');
  await expect(page.getByRole('cell').filter({ hasText: 'Package 18' })).toBeVisible();
  await expect(page.getByRole('cell').filter({ hasText: 'Package 9' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Tüm siparişleri göster' })).toBeVisible();
  await page.getByRole('tab', { name: 'Anlaşmalarım', exact: true }).click();
  await page.getByRole('tab', { name: 'Siparişlerim ve Aboneliklerim', exact: true }).click();
  await expect(page).not.toHaveURL(/subscriptionId/);
  await expect(page.getByRole('cell').filter({ hasText: 'Package 9' })).toBeVisible();
  await page.goto('/customer/agreements?view=orders&subscriptionId=sub-18');
  await page.getByRole('link', { name: 'Tüm siparişleri göster' }).click();
  await expect(page.getByRole('cell').filter({ hasText: 'Package 9' })).toBeVisible();
});
