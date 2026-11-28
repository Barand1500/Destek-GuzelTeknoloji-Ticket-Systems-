import { test, expect } from '@playwright/test';

test('customer can cancel an unpaid package or top-up after confirmation', async ({ page }) => {
  const orders = [
    { id: 'package', number: 34, kind: 'SUBSCRIPTION', name: 'Üst paket', status: 'PENDING' },
    { id: 'topup', number: 36, kind: 'TOP_UP', name: 'Ek kredi', status: 'FAILED' },
    { id: 'processing', number: 37, kind: 'SUBSCRIPTION', name: 'Banka sonucu bekleniyor', status: 'PENDING', paymentInProgress: true },
    { id: 'paid', number: 29, kind: 'SUBSCRIPTION', name: 'Ödenen paket', status: 'PAID' },
  ];
  const cancelled: string[] = [];
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let data: any = [];
    if (path === '/auth/refresh') data = { accessToken: 'test', user: { id: 'customer', name: 'Customer', role: 'CUSTOMER' } };
    if (path === '/auth/security') data = { enabled: false };
    if (path === '/public/license') data = { enabled: false, valid: true, status: 'DISABLED' };
    if (path === '/customers/customer/agreements') data = { customer: { id: 'customer', name: 'Customer' }, parent: null, children: [], agreements: [], charges: [], availableCredits: 0 };
    if (path === '/my/credit-store') data = { owner: { id: 'customer', name: 'Customer' }, settings: { enabled: true }, plans: [] };
    if (path.endsWith('/cancel')) {
      const id = path.split('/').at(-2)!;
      cancelled.push(id); orders.find(order => order.id === id)!.status = 'CANCELLED';
    }
    if (path === '/my/credit-store/orders') data = orders.map(order => ({ ...order, credits: 100, total: '10.00', currency: 'TRY', periodMonths: 1, unitPrice: null, createdAt: '2026-11-25T10:00:00Z', cancelledAt: null }));
    return route.fulfill({ json: { success: true, data, pagination: { page: 1, limit: 20, total: orders.length, totalPages: 1 } } });
  });
  await page.goto('/customer/agreements?view=orders');
  await expect(page.getByRole('row').filter({ hasText: 'Ödenen paket' }).getByRole('button', { name: 'Siparişi İptal Et', exact: true })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Banka sonucu bekleniyor' }).getByRole('button', { name: 'Siparişi İptal Et', exact: true })).toBeDisabled();
  for (const name of ['Üst paket', 'Ek kredi']) {
    const row = page.getByRole('row').filter({ hasText: name });
    await row.getByRole('button', { name: 'Siparişi İptal Et', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Siparişi İptal Et', exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Vazgeç', exact: true }).click();
    expect(cancelled).toHaveLength(name === 'Üst paket' ? 0 : 1);
    await row.getByRole('button', { name: 'Siparişi İptal Et', exact: true }).click();
    await dialog.getByRole('button', { name: 'İptali Onayla', exact: true }).click();
    await expect(row).toContainText('İptal edildi');
    await expect(row.getByRole('link', { name: 'Ödemeye Geç' })).toHaveCount(0);
  }
  expect(cancelled).toEqual(['package', 'topup']);
});
