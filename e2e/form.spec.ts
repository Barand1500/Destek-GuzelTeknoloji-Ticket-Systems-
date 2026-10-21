import { test, expect, type Page } from '@playwright/test';

async function publicMocks(page: Page) {
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/security')) return route.fulfill({ json: { success: true, data: { enabled: false, siteKey: null } } });
    if (path.endsWith('/public/form/settings')) return route.fulfill({ json: { success: true, data: { enabled: true, title: 'Destek Talebi', maxFileSize: 31457280, maxTotalFileSize: 31457280, fieldOrder: ['files', 'message', 'subject', 'email', 'phone', 'name', 'company'] } } });
    return route.fulfill({ status: 401, json: { success: false } });
  });
}

test('Form layout, GSM validation, aggregate uploads and top navigation work together', async ({ page }) => {
  await publicMocks(page);
  const submissions: string[] = [];
  await page.route('**/public/form/requests', route => {
    submissions.push(route.request().postData() ?? '');
    return route.fulfill({ status: 201, json: { success: true, data: { number: 456 } } });
  });
  await page.goto('/form/destek');
  const company = page.getByLabel('Firma / Şirket (isteğe bağlı)', { exact: true });
  const name = page.getByLabel('Ad Soyad', { exact: true });
  const phone = page.getByLabel('Telefon (isteğe bağlı)', { exact: true });
  const email = page.getByLabel('E-Posta Adresi', { exact: true });
  await expect(company).toBeVisible();
  expect((await company.boundingBox())!.y).toBeLessThan((await name.boundingBox())!.y);
  expect((await name.boundingBox())!.y).toBeLessThan((await phone.boundingBox())!.y);
  expect((await phone.boundingBox())!.y).toBeCloseTo((await email.boundingBox())!.y, 0);
  await expect(page.getByRole('button', { name: 'Departman', exact: true })).toHaveCount(0);
  const nav = page.getByRole('button', { name: 'Mevcut Talebimi Takip Et', exact: true });
  expect((await nav.boundingBox())!.x).toBeGreaterThan((await page.getByRole('heading', { name: 'Destek Talebi' }).boundingBox())!.x);
  await company.fill('Güzel Teknoloji'); await name.fill('Test Müşteri'); await email.fill('customer@example.test');
  await page.getByLabel('Konu', { exact: true }).fill('Vega');
  await page.getByLabel('Açıklama', { exact: true }).fill('Test');
  await phone.fill('2121234567');
  await page.getByRole('button', { name: 'Talebi Gönder' }).click();
  expect(submissions).toHaveLength(0);
  expect(await phone.evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(false);
  await phone.fill('5304112150');
  const files = page.locator('input[type=file]');
  await files.setInputFiles([
    { name: 'one.txt', mimeType: 'text/plain', buffer: Buffer.alloc(16 * 1024 * 1024, 'a') },
    { name: 'two.txt', mimeType: 'text/plain', buffer: Buffer.alloc(15 * 1024 * 1024, 'a') },
  ]);
  expect(await files.evaluate((element: HTMLInputElement) => element.validationMessage)).toContain('toplam');
  await page.getByRole('button', { name: 'Talebi Gönder' }).click();
  expect(submissions).toHaveLength(0);
  await files.setInputFiles(Array.from({ length: 12 }, (_, n) => ({ name: `${n}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`File ${n}`) })));
  await expect(page.getByText(/En fazla 3 dosya/)).toHaveCount(0);
  await page.screenshot({ path: '.local/form-create-updated.png', fullPage: true });
  await nav.click();
  await expect(page.getByRole('heading', { name: 'Talebimi Takip Et' })).toBeVisible();
  const newRequest = page.getByRole('button', { name: 'Yeni Talep Aç', exact: true });
  await expect(newRequest).toBeVisible();
  expect((await newRequest.boundingBox())!.y).toBeLessThan((await page.getByLabel('Talep No', { exact: true }).boundingBox())!.y);
  await page.screenshot({ path: '.local/form-tracking-updated.png', fullPage: true });
  await newRequest.click();
  await company.fill('Güzel Teknoloji'); await name.fill('Test Müşteri'); await email.fill('customer@example.test');
  await phone.fill('5304112150');
  await page.getByLabel('Konu', { exact: true }).fill('Vega'); await page.getByLabel('Açıklama', { exact: true }).fill('Test');
  await files.setInputFiles(Array.from({ length: 12 }, (_, n) => ({ name: `${n}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`File ${n}`) })));
  await page.getByRole('button', { name: 'Talebi Gönder' }).click();
  await expect(page.getByRole('status')).toContainText('#TK-00456');
  expect(submissions).toHaveLength(1);
  expect(submissions[0].match(/filename=/g)).toHaveLength(12);
  expect(submissions[0]).not.toContain('name="departmentId"');
});

test('Cloudflare-enabled Form sends one explicit token with and without a file', async ({ page }) => {
  await publicMocks(page);
  await page.route('**/auth/security', route => route.fulfill({ json: { success: true, data: { enabled: true, siteKey: 'form-test-site-key' } } }));
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.turnstile = {
      render(element, options) {
        element.dataset.responseField = String(options['response-field']);
        if (options['response-field'] !== false) {
          const hidden = document.createElement('input'); hidden.type = 'hidden'; hidden.name = 'cf-turnstile-response'; hidden.value = 'widget-token'; element.appendChild(hidden);
        }
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Test Doğrulama';
        button.onclick = () => options.callback('widget-token'); element.appendChild(button); return 'test-widget';
      },
      remove() { document.querySelectorAll('[data-response-field]').forEach(element => element.replaceChildren()); }
    };
  ` }));
  const requests: string[] = [];
  await page.route('**/public/form/requests', route => {
    requests.push(route.request().postData() ?? '');
    return route.fulfill({ status: 201, json: { success: true, data: { number: 123 } } });
  });
  for (const withFile of [false, true]) {
    await page.goto('/form/destek');
    await page.getByLabel('Ad Soyad', { exact: true }).fill('Form Müşteri');
    await page.getByLabel('E-Posta Adresi', { exact: true }).fill('customer@example.test');
    await page.getByLabel('Telefon (isteğe bağlı)', { exact: true }).fill('5304112150');
    await page.getByLabel('Firma / Şirket (isteğe bağlı)', { exact: true }).fill('Test Şirket');
    await page.getByLabel('Konu', { exact: true }).fill('Form testi');
    await page.getByLabel('Açıklama', { exact: true }).fill('Test mesajı');
    if (withFile) await page.locator('input[type=file]').setInputFiles({ name: 'test.txt', mimeType: 'text/plain', buffer: Buffer.from('Test file') });
    await expect(page.locator('[data-response-field]')).toHaveAttribute('data-response-field', 'false');
    await page.getByRole('button', { name: 'Test Doğrulama', exact: true }).click();
    // Also tolerate a stale widget's hidden input, without submitting the extra field.
    await page.locator('form.public-form-fields').evaluate(form => { const input = document.createElement('input'); input.type = 'hidden'; input.name = 'cf-turnstile-response'; input.value = 'old-widget-token'; form.appendChild(input); });
    await page.getByRole('button', { name: 'Talebi Gönder', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('#TK-00123');
  }
  expect(requests).toHaveLength(2);
  for (const body of requests) {
    expect(body).toContain('name="turnstileToken"'); expect(body).toContain('widget-token');
    expect(body).not.toContain('cf-turnstile-response'); expect(body).not.toContain('old-widget-token');
  }
  expect(requests[0]).not.toContain('filename='); expect(requests[1]).toContain('filename="test.txt"');
});
test('guest can submit a short subject in an embedded Form and request an email tracking link without signing in', async ({ page }) => {
  await publicMocks(page);
  const submissions: string[] = [], access: unknown[] = [];
  await page.route('**/public/form/requests', async route => { submissions.push(route.request().postData() ?? ''); await route.fulfill({ status: 201, json: { success: true, data: { number: 123 } } }); });
  await page.route('**/public/form/access', async route => { access.push(route.request().postDataJSON()); await route.fulfill({ json: { success: true, data: { message: 'Bilgiler eşleşiyorsa takip bağlantısı e-posta adresinize gönderildi.' } } }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/form/destek?embed=1');
  await expect(page.getByRole('heading', { name: 'Destek Talebi' })).toBeVisible();
  await page.getByLabel('Ad Soyad', { exact: true }).fill('Test Müşteri');
  await page.getByLabel('E-Posta Adresi', { exact: true }).fill('customer@example.test');
  await page.getByLabel('Firma / Şirket (isteğe bağlı)').fill('Test Şirket');
  await page.getByLabel('Açıklama', { exact: true }).fill('Yardım istiyorum.');
  await page.getByRole('button', { name: 'Talebi Gönder' }).click();
  expect(submissions).toHaveLength(0);
  await page.getByLabel('Konu', { exact: true }).fill('x');
  await page.getByRole('button', { name: 'Talebi Gönder' }).click();
  await expect(page.getByRole('status')).toContainText('#TK-00123');
  expect(submissions[0]).toContain('customer@example.test');
  expect(submissions[0]).toContain('name="subject"');
  expect(submissions[0]).not.toContain('name="departmentId"');
  await page.screenshot({ path: '.local/form-create-updated.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Talebimi Takip Et', exact: true }).click();
  await expect(page.getByLabel('Talep No', { exact: true })).toHaveValue('TK-00123');
  await page.getByLabel('E-Posta Adresi', { exact: true }).fill('customer@example.test');
  await page.getByRole('button', { name: 'Takip Bağlantısı Gönder' }).click();
  await expect(page.getByRole('status')).toContainText('Bilgiler eşleşiyorsa');
  expect(access).toEqual([{ email: 'customer@example.test', number: 123 }]);
});

test('guest tracking displays public messages, posts to its scoped endpoint and retrieves replies without a staff session', async ({ page }) => {
  await publicMocks(page);
  const token = 'b'.repeat(64), sent: string[] = [];
  const messages = [{ id: 'm1', type: 'CUSTOMER_MESSAGE', body: 'İlk mesaj', createdAt: '2026-10-19T09:00:00Z', author: { name: 'Müşteri' }, attachments: [] }, { id: 'm2', type: 'AGENT_REPLY', body: 'Destek yanıtı', createdAt: '2026-10-19T09:01:00Z', author: { name: 'Personel' }, attachments: [] }];
  await page.route('**/public/form/conversation**', async route => {
    expect(route.request().headers()['x-form-token']).toBe(token);
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/messages')) {
      sent.push(route.request().postData() ?? '');
      messages.push({ id: 'm3', type: 'CUSTOMER_MESSAGE', body: 'Teşekkürler', createdAt: '2026-10-19T09:02:00Z', author: { name: 'Müşteri' }, attachments: [] });
      return route.fulfill({ status: 201, json: { success: true } });
    }
    const index = messages.findIndex(item => item.id === url.searchParams.get('after'));
    return route.fulfill({ json: { success: true, data: { number: 123, subject: 'Vega', status: 'Açık', closed: false, messages: url.searchParams.has('after') ? messages.slice(index + 1) : messages, hasMore: false, direction: url.searchParams.has('after') ? 'after' : 'latest' } } });
  });
  await page.goto(`/form/talep#${token}`);
  await expect(page.getByRole('heading', { name: 'Vega' })).toBeVisible();
  await expect(page.getByText('Destek yanıtı', { exact: true })).toBeVisible();
  await expect(page.getByText('Sayfa 1', { exact: true })).toHaveCount(0);
  await page.getByLabel('Yanıtınız', { exact: true }).fill('Teşekkürler');
  const reply = page.locator('textarea[name="body"]');
  await reply.press('Shift+Enter');
  await expect(reply).toHaveValue('Teşekkürler\n');
  expect(sent).toHaveLength(0);
  await reply.dispatchEvent('keydown', { key: 'Enter', repeat: true, bubbles: true });
  expect(sent).toHaveLength(0);
  await reply.fill('   ');
  await reply.press('Enter');
  expect(sent).toHaveLength(0);
  await reply.fill('Teşekkürler');
  await reply.press('Enter');
  await expect(page.getByText('Teşekkürler', { exact: true })).toBeVisible();
  expect(sent).toHaveLength(1);
  await page.screenshot({ path: '.local/form-thread.png', fullPage: true });
  await page.getByRole('link', { name: 'Yeni Talep Aç', exact: true }).click();
  await expect(page).toHaveURL('/form/destek');
  await expect(page.getByRole('heading', { name: 'Destek Talebi', exact: true })).toBeVisible();
});

test('Form settings save independently and provide a shareable link and iframe code', async ({ page }) => {
  await publicMocks(page);
  let form = { enabled: false, title: 'Destek Talebi' };
  let formWrites = 0, otherWrites = 0;
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { success: true, data: { accessToken: 'test', user: { id: 'form-admin', name: 'Admin', role: 'ADMIN' } } } });
    if (path === '/integrations/form') {
      if (route.request().method() === 'PUT') { form = route.request().postDataJSON(); formWrites++; }
      return route.fulfill({ json: { success: true, data: form } });
    }
    if (path === '/integrations') { if (route.request().method() !== 'GET') otherWrites++; return route.fulfill({ json: { success: true, data: { smtpEnabled: true, smtpHost: 'smtp.test', smtpFromAddress: 'support@example.test' } } }); }
    if (path === '/notification-settings') return route.fulfill({ json: { success: true, data: { ticketCreatedSubject: 'Created', ticketCreatedBody: 'Created', ticketReplySubject: 'Reply', ticketReplyBody: 'Reply' } } });
    if (path === '/departments') return route.fulfill({ json: { success: true, data: [{ id: 'dept-1', name: 'Teknik Destek' }] } });
    return route.fulfill({ json: { success: true, data: [], pagination: { page: 1, total: 0, totalPages: 1 } } });
  });
  await page.goto('/admin/integrations/channels');
  await page.getByRole('tab', { name: 'Form', exact: true }).click();
  await page.getByLabel('Formu Etkinleştir').check();
  await expect(page.getByRole('button', { name: /alanını (yukarı|aşağı) taşı/ })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Zorunlu alanlar', exact: true }).getByRole('checkbox')).toHaveCount(4);
  await page.getByRole('button', { name: 'Taleplerin Düşeceği Departman', exact: true }).click();
  await page.getByRole('option', { name: 'Teknik Destek', exact: true }).click();
  const save = page.getByRole('button', { name: 'Kaydet', exact: true });
  await expect(save).toBeEnabled();
  const buttonBox = await save.boundingBox(), cardBox = await page.getByRole('region', { name: 'Form Ayarları' }).boundingBox();
  expect(buttonBox!.width).toBeLessThan(250);
  expect(buttonBox!.x).toBeCloseTo(cardBox!.x, 0);
  expect(buttonBox!.y).toBeGreaterThanOrEqual(cardBox!.y + cardBox!.height);
  await save.click();
  await expect(page.getByRole('status')).toContainText('Form ayarları kaydedildi.');
  expect(formWrites).toBe(1); expect(otherWrites).toBe(0);
  expect(form).toEqual({ enabled: true, title: 'Destek Talebi', departmentId: 'dept-1', requirePhone: false, requireCompany: false, requireSubject: true, requireMessage: true, fieldOrder: ['company', 'name', 'phone', 'email', 'subject', 'message', 'files'] });
  await expect(page.getByLabel('Form Bağlantısı', { exact: true })).toHaveValue('http://localhost:5173/form/destek');
  await expect(page.getByLabel('Siteye Gömme Kodu (iframe)')).toHaveValue(/<iframe.*embed=1/);
  await page.screenshot({ path: '.local/form-settings.png', fullPage: true });
});

test('Form opens inside an actual iframe and an expired link can return to email recovery', async ({ page }) => {
  await publicMocks(page);
  await page.goto('/form/destek');
  await page.setContent('<iframe title="Destek Formu" src="http://localhost:5173/form/destek?embed=1" style="width:380px;height:1200px;border:0"></iframe>');
  await expect(page.frameLocator('iframe').getByRole('heading', { name: 'Destek Talebi' })).toBeVisible();
  await expect(page.frameLocator('iframe').getByRole('button', { name: 'Talebi Gönder' })).toBeEnabled();
  await page.route('**/public/form/conversation', route => route.fulfill({ status: 401, json: { success: false, error: { message: 'Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı isteyin.' } } }));
  await page.goto(`/form/talep#${'a'.repeat(64)}`);
  await page.getByRole('link', { name: 'Yeni takip bağlantısı iste' }).click();
  await expect(page.getByRole('heading', { name: 'Talebimi Takip Et' })).toBeVisible();
  await expect(page.getByLabel('Talep No', { exact: true })).toBeVisible();
});

test('a closed Form keeps submission disabled and the tracking email field has a visible border in both themes', async ({ page }) => {
  await publicMocks(page);
  await page.route('**/public/form/settings', route => route.fulfill({ json: { success: true, data: { enabled: false, title: 'Destek Talebi', maxFileSize: 5242880 } } }));
  await page.goto('/form/destek');
  await expect(page.getByText('Form şu anda talep kabul etmiyor.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Talebi Gönder' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mevcut Talebimi Takip Et' }).click();
  const email = page.getByLabel('E-Posta Adresi', { exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await expect(email).toBeVisible();
    const style = await email.evaluate(element => { const css = getComputedStyle(element); return { border: parseFloat(css.borderTopWidth), height: element.getBoundingClientRect().height, radius: parseFloat(css.borderRadius) }; });
    expect(style.border).toBeGreaterThanOrEqual(1);
    expect(style.height).toBeGreaterThanOrEqual(44);
    expect(style.radius).toBeGreaterThanOrEqual(8);
    await email.fill('customer@example.test');
    await expect(email).toHaveValue('customer@example.test');
    await page.screenshot({ path: `.local/form-tracking-${theme}.png`, fullPage: true });
  }
});

test('Giriş Yap sits beside the tracking-link button and opens only the ticket after an email code', async ({ page }) => {
  await publicMocks(page);
  const token = 'd'.repeat(64), challengeId = '50848c07-b311-4a57-85e0-5b3a1e23d724';
  let reads = 0;
  const loginRequests: unknown[] = [], verification: unknown[] = [];
  await page.route('**/public/form/login', async route => {
    loginRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: { success: true, data: { challengeId, message: 'Bilgiler eşleşiyorsa giriş kodu e-posta adresinize gönderildi.' } } });
  });
  await page.route('**/public/form/login/verify', async route => {
    const input = route.request().postDataJSON(); verification.push(input);
    return route.fulfill(input.code === '123456' ? { json: { success: true, data: { token } } } : { status: 400, json: { success: false, error: { message: 'Kod geçersiz veya süresi dolmuş. Yeni kod isteyin.' } } });
  });
  await page.route('**/public/form/conversation**', async route => {
    reads++; expect(route.request().headers()['x-form-token']).toBe(token);
    return route.fulfill({ json: { success: true, data: { number: 123, subject: 'Kodla açılan talep', status: 'Açık', closed: false, messages: [], hasMore: false, direction: 'latest' } } });
  });
  await page.goto('/form/talep');
  await page.getByLabel('Talep No', { exact: true }).fill('TK-00123');
  await page.getByLabel('E-Posta Adresi', { exact: true }).fill('customer@example.test');
  const loginButton = page.getByRole('button', { name: 'Giriş Yap', exact: true });
  const linkBox = await page.getByRole('button', { name: 'Takip Bağlantısı Gönder', exact: true }).boundingBox(), loginBox = await loginButton.boundingBox();
  expect(loginBox!.x).toBeGreaterThan(linkBox!.x);
  expect(loginBox!.y).toBeCloseTo(linkBox!.y, 0);
  await page.screenshot({ path: '.local/form-login.png', fullPage: true });
  await loginButton.click();
  await expect(page.getByLabel('Giriş Kodu', { exact: true })).toBeVisible();
  expect(loginRequests).toEqual([{ email: 'customer@example.test', number: 123 }]);
  expect(reads).toBe(0);
  await page.getByLabel('Giriş Kodu', { exact: true }).fill('000000');
  await page.getByRole('button', { name: 'Doğrula ve Giriş Yap', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Kod geçersiz');
  expect(reads).toBe(0);
  await page.getByLabel('Giriş Kodu', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Doğrula ve Giriş Yap', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kodla açılan talep', exact: true })).toBeVisible();
  expect(verification).toEqual([{ challengeId, code: '000000' }, { challengeId, code: '123456' }]);
  await expect(page).toHaveURL(new RegExp(`/form/talep#${token}$`));
});
