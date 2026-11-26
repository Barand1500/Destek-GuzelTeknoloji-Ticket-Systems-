import { test, expect } from '@playwright/test';

for (const kind of ['TOP_UP', 'SUBSCRIPTION']) {
  for (const status of ['PAID', 'PARTIAL_REFUND', 'REFUNDED', 'PENDING', 'FAILED']) {
    test('customer cannot cancel or request refunds for ' + kind + ' ' + status, async ({ page }) => {
      await page.route('**/api/v1/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data: unknown = [];
        if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'customer', name: 'Customer', role: 'CUSTOMER' } };
        if (path.endsWith('/customers/customer/agreements')) data = { customer: { id: 'customer', name: 'Customer' }, parent: null, children: [], agreements: [], charges: [], availableCredits: 100 };
        if (path.endsWith('/orders')) return route.fulfill({ json: { success: true, data: [{ id: 'order', number: 7, name: 'Customer package', kind, credits: 100, usedCredits: 0, canBankCancel: true, total: '250.00', currency: 'TRY', validityDays: 30, paidAt: new Date().toISOString(), status, createdAt: new Date().toISOString() }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
        await route.fulfill({ json: { success: true, data } });
      });
      await page.goto('/customer/agreements?view=orders');
      await expect(page.getByRole('cell', { name: 'Customer package', exact: false })).toBeVisible();
      await expect(page.getByRole('button', { name: /İade|İptal/ })).toHaveCount(0);
    });
  }
}
