import { test, expect, type Page } from '@playwright/test';

async function fakeTurnstile(page: Page) {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', route => route.fulfill({ contentType: 'application/javascript', body: `
    const widgets = new Map(); let sequence = 0;
    window.turnstile = {
      render(element, options) {
        const id = String(++sequence);
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = 'Doğrulamayı Tamamla';
        button.onclick = () => options.callback('test-token-' + id);
        element.dataset.action = options.action; element.appendChild(button);
        widgets.set(id, {element, options}); return id;
      },
      remove(id) { const item = widgets.get(id); if (item) item.element.replaceChildren(); widgets.delete(id); }
    };
    window.addEventListener('test:expire-turnstile', () => widgets.forEach(item => item.options['expired-callback']()));
  ` }));
}

test('login requires a solved challenge, expires it and renews it after an unsuccessful login', async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await fakeTurnstile(page);
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/security')) return route.fulfill({ json: { success: true, data: { enabled: true, siteKey: 'public-test-key' } } });
    if (path.endsWith('/auth/login')) {
      writes.push(route.request().postDataJSON());
      return route.fulfill({ status: 401, json: { success: false, error: { message: 'E-posta veya şifre hatalı.' } } });
    }
    return route.fulfill({ status: 401, json: { success: false } });
  });
  await page.goto('/auth');
  await page.getByRole('textbox', { name: 'E-Posta Adresi', exact: true }).fill('test@example.test');
  await page.locator('input[name="password"]').fill('test-password');
  const login = page.getByRole('button', { name: 'Giriş Yap', exact: true });
  await expect(login).toBeDisabled();
  await page.getByRole('button', { name: 'Doğrulamayı Tamamla' }).click();
  await expect(login).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('test:expire-turnstile')));
  await expect(login).toBeDisabled();
  await page.getByRole('button', { name: 'Doğrulamayı Tamamla' }).click();
  await login.click();
  await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı.');
  await expect(login).toBeDisabled();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ email: 'test@example.test', password: 'test-password', turnstileToken: 'test-token-1' });
  await page.getByRole('button', { name: 'Doğrulamayı Tamamla' }).click();
  await login.click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].turnstileToken).not.toEqual(writes[0].turnstileToken);
});

test('password reset sends no mail request until its own challenge is solved', async ({ page }) => {
  const writes: Array<Record<string, unknown>> = [];
  await fakeTurnstile(page);
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/security')) return route.fulfill({ json: { success: true, data: { enabled: true, siteKey: 'public-test-key' } } });
    if (path.endsWith('/auth/forgot-password')) { writes.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, data: {} } }); }
    return route.fulfill({ status: 401, json: { success: false } });
  });
  await page.goto('/auth');
  await page.getByRole('textbox', { name: 'E-Posta Adresi', exact: true }).fill('test@example.test');
  await page.getByRole('button', { name: 'Şifremi Unuttum?', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Şifrenizi Yenileyin' })).toBeVisible();
  await expect(page.locator('[data-action="forgot_password"]')).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Doğrulamayı Tamamla' }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ email: 'test@example.test', turnstileToken: expect.any(String) });
  await expect(page.getByRole('button', { name: 'Kodu Tekrar Gönder' })).toBeDisabled();
  await page.getByRole('button', { name: 'Doğrulamayı Tamamla' }).click();
  await page.getByRole('button', { name: 'Kodu Tekrar Gönder' }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].turnstileToken).not.toEqual(writes[0].turnstileToken);
});
