import { test, expect } from '@playwright/test';

test('Akbank renewal registers a bank instruction after the first 3D payment', async ({ page }) => {
  const writes: any[] = [];
  const order = { id: 'akbank-order', number: 55, name: 'Destek kredisi', credits: 1000, total: '12750.00', currency: 'TRY', status: 'PENDING', paymentAvailable: true, provider: 'akbank', recurringAvailable: true, renewalRequested: true, customer: { id: 'customer', name: 'Test User', email: 'test@example.test', phone: '5550000000' } };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: any = [];
    if (path.endsWith('/auth/refresh')) data = { accessToken: 'test', user: { id: 'customer', name: 'Test User', role: 'CUSTOMER' } };
    if (path.endsWith('/customers/customer/agreements')) data = { customer: order.customer, parent: null, children: [], agreements: [], charges: [], availableCredits: 0 };
    if (path.endsWith('/checkout')) data = order;
    if (path.endsWith('/pay')) {
      writes.push(route.request().postDataJSON());
      data = { action: 'https://virtualpospaymentgatewaypre.akbank.com/securepay', fields: { paymentModel: '3D_PAY', orderId: 'bank-attempt', creditCard: '4111111111111111', expiredDate: '1230', cvv: '123' }, sessionId: 'session-1', recurringRequested: true };
    }
    if (path.endsWith('/akbank-enrollment/session-1')) {
      if (route.request().method() === 'POST') {
        writes.push(route.request().postDataJSON());
        data = { state: 'ACTIVE' };
      } else {
        data = { status: 'PAID', recurringState: null };
      }
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.context().route('https://virtualpospaymentgatewaypre.akbank.com/securepay', route => route.fulfill({ contentType: 'text/html', body: '<h1>Bank 3D verification</h1>' }));
  await page.goto('/customer/agreements?view=checkout&orderId=akbank-order');
  const panel = page.getByRole('form', { name: 'Kart ile ödeme' });
  await panel.getByLabel('Kart üzerindeki ad soyad').fill('TEST USER');
  await panel.getByLabel('Kart numarası').fill('4111111111111111');
  await panel.getByLabel('Son kullanma tarihi').fill('1230');
  await panel.getByLabel('CVC').fill('123');
  await panel.getByText(/İlk ödemeyi şimdi yapmayı/).click();
  const popupPromise = page.waitForEvent('popup');
  await panel.getByRole('button', { name: /Öde$/ }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: 'Bank 3D verification' })).toBeVisible();
  await expect(page.getByText(/otomatik yenileme talimatı kuruldu/)).toBeVisible({ timeout: 15000 });
  const payment = writes.find(write => write.card);
  expect(payment).toMatchObject({ renewalConsent: true });
  expect(payment.manualRenewalConsent).toBeUndefined();
  const enrollment = writes.find(write => write.consent === true);
  expect(enrollment).toMatchObject({ card: { holder: 'TEST USER', number: '4111111111111111', expiry: '1230', cvc: '123' }, consent: true });
});
