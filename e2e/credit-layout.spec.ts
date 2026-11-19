import { test, expect } from '@playwright/test';

for (const theme of ['light', 'dark']) {
  for (const admin of [false, true]) {
    test(`credit screens fit mobile and desktop ${admin ? 'staff' : 'customer'} ${theme}`, async ({ page }) => {
      await page.addInitScript(theme => localStorage.setItem('helpdesk-theme', theme), theme);
      await page.route('**/api/v1/**', async route => {
        const path = new URL(route.request().url()).pathname;
        let data: any = [];
        const pagination = { page: 1, limit: 20, total: 1, totalPages: 1 };
        if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'customer', name: 'Test User', role: admin ? 'ADMIN' : 'CUSTOMER' } };
        if (path.endsWith('/customers/customer/agreements')) data = { customer: { id: 'customer', name: 'Test User' }, parent: null, children: [], agreements: [], charges: [], availableCredits: 100 };
        const settings = { currency: 'TRY', enabled: true, unitPrice: '1.00', minCredits: 1, maxCredits: 10000, validityDays: 365, alertsEnabled: true, alertChannels: ['IN_APP'] };
        const plans = [{ id: 'plan', name: 'Başlangıç planı', periodMonths: 1, credits: 100, price: '1.00', currency: 'TRY', active: true }];
        if (path.endsWith('/credit-sales')) data = { settings, plans };
        if (path.endsWith('/payment-settings/akbank')) data = { mode: 'sandbox', credentialsConfigured: false, enabled: false, publicUrl: 'https://portal.test', testedAt: null, lastError: null };
        if (path.endsWith('/payment-settings')) data = { provider: 'iyzico', mode: 'sandbox', credentialsConfigured: false, enabled: false, recurringEnabled: false, publicUrl: 'https://portal.test', testedAt: null, lastError: null };
        if (path.endsWith('/my/credit-store')) data = { settings, plans, owner: { id: 'customer', name: 'Test User' }, paymentAvailable: true, provider: 'akbank' };
        if (path.endsWith('/orders')) data = [{ id: 'order', number: 7, name: 'Başlangıç planı', kind: 'SUBSCRIPTION', periodMonths: 1, credits: 100, total: '1.00', currency: 'TRY', status: 'PAID', createdAt: '2026-11-19T08:00:00Z', customer: { name: 'Test User' } }];
        if (path.endsWith('/subscriptions')) data = [{ id: 'subscription', name: 'Başlangıç planı', amount: '1.00', currency: 'TRY', credits: 100, periodMonths: 1, autoRenew: true, status: 'ACTIVE', nextPaymentOn: '2026-12-19', currentEndsOn: '2026-12-18', customer: { name: 'Test User', company: null } }];
        if (path.endsWith('/checkout')) data = { id: 'order', number: 7, name: 'Başlangıç planı', total: '1.00', currency: 'TRY', credits: 100, status: 'PENDING', provider: 'akbank', paymentAvailable: true, customer: { name: 'Test User' } };
        if (path.endsWith('/reversals')) data = { canSelfRefund: true, usedCredits: 0, total: '1.00', currency: 'TRY', originalCredits: 100, refundableCredits: 100, refundableAmount: '1.00', refundedAmount: '0', refundedCredits: 0, canCancel: true, hasPending: false, data: [] };
        await route.fulfill({ json: { success: true, data, pagination } });
      });
      const base = admin ? '/admin/credit-sales' : '/customer/agreements';
      const views = admin ? ['', 'orders', 'subscriptions', 'settings'] : ['store', 'orders', 'subscriptions', 'checkout', 'history'];
      for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const view of views) {
          await page.goto(view === 'settings' ? '/admin/settings/payments' : `${base}?view=${view}&orderId=order`);
          if (view !== 'settings') await expect(page.locator('.credit-workspace-tabs')).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await expect(page.locator('main h1')).toBeVisible();
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          if (view !== 'settings') {
            const navigation = await page.locator('.credit-workspace-tabs').boundingBox();
            const heading = await page.locator('main h1').boundingBox();
            expect(navigation!.y).toBeGreaterThan(heading!.y + heading!.height);
            const tabs = page.locator('.credit-workspace-tabs');
            await expect(tabs.getByRole('tab', { selected: true })).toHaveCount(1);
            await expect(tabs.getByRole('tab', { selected: true })).toHaveCSS('border-bottom-style', 'solid');
          } else {
            await expect(page.getByRole('button', { name: 'Akbank ortamı' })).toContainText('Test ortamı');
            await expect(page.getByRole('button', { name: 'iyzico ortamı' })).toContainText('Test ortamı');
          }
          if (admin && !view) {
            const title = page.locator('.credit-admin-plans article > div');
            await expect(title).toContainText('Başlangıç planı');
            expect((await title.boundingBox())!.width).toBeGreaterThan(120);
          }
          if (view === 'orders') {
            await page.getByRole('button', { name: admin ? 'İade / Banka İptali' : 'İade Et', exact: true }).click();
            const form = page.locator('.payment-reversal-form');
            await expect(form).toBeVisible();
            const consent = await form.locator('.credit-renewal-choice').boundingBox();
            const button = await form.getByRole('button', { name: 'İadeyi Onayla' }).boundingBox();
            expect(button!.y - consent!.y - consent!.height).toBeGreaterThanOrEqual(16);
            await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          }
          if (width === 375 && (view === 'orders' || (admin && !view) || (!admin && view === 'store'))) {
            await page.screenshot({ path: `.local/credit-layout-${admin ? 'staff' : 'customer'}-${theme}-${view || 'plans'}.png`, fullPage: true });
          }
        }
      }
    });
  }
}
