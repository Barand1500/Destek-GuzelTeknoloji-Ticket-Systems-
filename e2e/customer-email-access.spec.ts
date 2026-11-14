import { test, expect } from '@playwright/test';
test('Customer email code opens the portal and allows password setup without announcements', async ({ page }) => {
  let loggedIn = false;
  let profileWrite: any;
  const user = { id: 'customer', name: 'Kod Müşterisi', email: 'customer@example.test', phone: '5301234567', role: 'CUSTOMER' };
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const send = (data: unknown) => route.fulfill({ json: { success: true, data } });
    if (path === '/auth/refresh') return loggedIn ? send({ accessToken: 'test', user }) : route.fulfill({ status: 401, json: { message: 'Oturum yok' } });
    if (path === '/auth/security') return send({ enabled: false });
    if (path === '/auth/customer-email') return send({ challengeId: 'challenge', message: 'Kayıtlı adresinize kod gönderildi.' });
    if (path === '/auth/customer-email/verify') {
      if (route.request().postDataJSON().code !== '123456') return route.fulfill({ status: 400, json: { error: { message: 'Kod geçersiz veya süresi dolmuş.' } } });
      loggedIn = true; return send({ accessToken: 'test', user });
    }
    if (path === '/profile') {
      if (route.request().method() === 'PATCH') profileWrite = route.request().postDataJSON();
      return send({ ...user, canSetPasswordWithoutCurrent: !profileWrite });
    }
    if (path === '/staff-presence') return send({ staff: [], idleMinutes: 5 });
    if (path.includes('dashboard')) return send({ total: 0, unassigned: 0, conversationsToday: 0, statuses: {} });
    return send([]);
  });
  await page.goto('/auth');
  await page.getByRole('button', { name: 'E-Posta ile Devam Et', exact: true }).click();
  await page.locator('input[name=email]').fill(user.email);
  await page.getByRole('button', { name: 'Kod Gönder', exact: true }).click();
  await page.getByLabel('Doğrulama Kodu', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Kodu Doğrula ve Giriş Yap', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Kod geçersiz');
  await page.getByLabel('Doğrulama Kodu', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Kodu Doğrula ve Giriş Yap', exact: true }).click();
  await expect(page).toHaveURL(/customer/);
  await expect(page.getByRole('button', { name: 'Duyurular', exact: true })).toHaveCount(0);
  await page.goto('/customer/profile');
  await expect(page.getByText(/E-posta koduyla doğrulandınız/)).toBeVisible();
  await page.locator('input[name=password]').fill('new-password-123');
  await page.locator('input[name=passwordRepeat]').fill('new-password-123');
  await page.screenshot({ path: '.local/customer-email-profile.png', fullPage: true });
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect.poll(() => profileWrite?.password).toBe('new-password-123');
  expect(profileWrite.currentPassword).toBeUndefined();
});
