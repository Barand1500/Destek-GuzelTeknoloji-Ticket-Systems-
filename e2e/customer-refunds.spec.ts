import { test, expect } from '@playwright/test';

for (const scenario of ['unused', 'used', 'retry', 'same-day']) {
  const used = scenario === 'used', retry = scenario === 'retry', sameDay = scenario === 'same-day';
  test(`customer refund ${scenario}`, async ({ page }) => {
    let refunded = false, requested = false;
    const writes: any[] = [];
    await page.route('**/api/v1/**', async route => {
      const path = new URL(route.request().url()).pathname;
      let data: any = [];
      if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'customer', name: 'Test User', role: 'CUSTOMER' } };
      if (path.endsWith('/customers/customer/agreements')) data = { customer: { id: 'customer', name: 'Test User' }, parent: null, children: [], agreements: [], charges: [], availableCredits: 100 };
      if (path.endsWith('/orders')) return route.fulfill({ json: { success: true, data: [{ id: 'order', number: 7, name: 'Ek kredi', kind: 'TOP_UP', credits: 100, total: '250.00', currency: 'TRY', validityDays: 365, paidAt: sameDay ? new Date().toISOString() : null, usedCredits: used ? 1 : 0, reversals: refunded ? [{ id: 'refund', kind: sameDay ? 'CANCEL' : 'REFUND', status: 'SUCCEEDED', amount: '250.00', credits: 100 }] : [], status: refunded ? 'REFUNDED' : 'PAID', createdAt: '2026-11-19T08:00:00Z' }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
      if (path.endsWith('/orders/order/refund-request')) { requested = true; data = { status: 'OPEN' }; }
      if (path.endsWith('/orders/order/reversals')) {
        if (route.request().method() === 'POST') { writes.push(route.request().postDataJSON()); refunded = !(retry && writes.length === 1); data = { id: 'refund', kind: sameDay ? 'CANCEL' : 'REFUND', status: refunded ? 'SUCCEEDED' : 'FAILED' }; }
        else data = { refundRequest: requested ? { status: 'OPEN', reason: 'Unused credits refund' } : null, canCancel: sameDay && !refunded, orderNumber: 7, orderName: 'Ek kredi', refundableCredits: used ? 99 : 100, refundableAmount: used ? '247.50' : '250.00', canSelfRefund: !used && !refunded, usedCredits: used ? 1 : 0, currency: 'TRY', total: '250.00', originalCredits: 100, hasPending: false, data: refunded ? [{ id: 'refund', kind: sameDay ? 'CANCEL' : 'REFUND', status: 'SUCCEEDED', amount: '250.00', currency: 'TRY' }] : [] };
      }
      await route.fulfill({ json: { success: true, data } });
    });
    await page.goto('/customer/agreements?view=orders');
    await page.getByRole('button', { name: used ? 'İade Talep Et' : sameDay ? 'Ödemeyi İptal Et' : 'İade Et', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Sipariş iadesi' });
    if (used) {
      await expect(panel.getByText(/Kalan 99 kredi/)).toBeVisible();
      await expect(panel.getByText(/247,50/)).toBeVisible();
      await expect(panel.getByRole('button', { name: sameDay ? 'Ödeme İptalini Onayla' : 'İadeyi Onayla' })).toHaveCount(0);
      expect(writes).toHaveLength(0);
      await panel.getByLabel('İade talep nedeni').fill('Unused credits refund');
      await panel.getByRole('button', { name: 'İade Talebini Gönder' }).click();
      await expect(panel.getByText(/yönetici incelemesini bekliyor/)).toBeVisible();
      await expect(page).toHaveURL(/view=orders/);
      expect(writes).toHaveLength(0);
    } else {
      await panel.getByLabel('İade nedeni').fill('Siparişimi kullanmayacağım');
      await panel.getByText('İadeyi ve ilgili kredilerin kaldırılmasını onaylıyorum.').click();
      await expect(panel.getByRole('switch')).toBeChecked();
      await panel.getByRole('button', { name: sameDay ? 'Ödeme İptalini Onayla' : 'İadeyi Onayla' }).click();
      if (retry) {
        await expect(panel.getByText('İade tamamlanamadı. Krediniz hesabınızda kaldı.')).toBeVisible();
        await panel.getByText('İadeyi ve ilgili kredilerin kaldırılmasını onaylıyorum.').click();
        await panel.getByRole('button', { name: sameDay ? 'Ödeme İptalini Onayla' : 'İadeyi Onayla' }).click();
      }
      if (sameDay) {
        await expect(panel.getByRole('heading', { name: 'Ödeme İptali', exact: true })).toBeVisible();
        await expect(panel.getByText(/Ödeme iptali bankada doğrulandı/)).toBeVisible();
        await expect(page.getByRole('cell', { name: /Ödeme iptal edildi/ })).toBeVisible();
        await expect(page.getByRole('button', { name: 'İptal Detayı' })).toBeVisible();
        await page.reload();
        await page.getByRole('button', { name: 'İptal Detayı' }).click();
        await expect(page.getByRole('heading', { name: 'Ödeme İptali', exact: true })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Sipariş iadesi' }).getByText(/Ödeme iptal edildi/)).toBeVisible();
      } else await expect(panel.getByText('İade tamamlandı.')).toBeVisible();
      expect(writes).toHaveLength(retry ? 2 : 1);
      if (retry) expect(writes[1].requestKey).not.toBe(writes[0].requestKey);
      expect(Object.keys(writes[0]).sort()).toEqual(['reason', 'requestKey']);
      await expect(panel.getByRole('button', { name: /Doğrula|Sonucunu Sorgula/ })).toHaveCount(0);
    }
  });
}
