import { test, expect } from '@playwright/test';

test('reply channels and save remain reachable near the bottom of the screen', async ({ page }) => {
  const customer = { id: 'customer-channel', name: 'Customer', role: 'CUSTOMER', email: 'customer@example.test', phone: '05304112150' };
  const conversation = { id: 'channel-test', number: 1, subject: 'Channel test', channel: 'FORM', replyChannels: ['FORM'], status: 'OPEN', priority: 'NORMAL', customer, customerId: customer.id, department: { id: 'department-test', name: 'Support' }, departmentId: 'department-test', tags: [], createdAt: '2026-10-19T10:00:00Z' };
  const patches: unknown[] = [];
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { success: true, data: { accessToken: 'test-token', user: { id: 'admin-test', name: 'Admin', role: 'ADMIN' } } } });
    if (path === '/communication-channels') return route.fulfill({ json: { data: { EMAIL: true, SMS: true, WHATSAPP: true, FORM: true } } });
    if (path === '/conversations/channel-test') {
      if (request.method() === 'PATCH') {
        const patch = request.postDataJSON(); patches.push(patch); Object.assign(conversation, patch);
      }
      return route.fulfill({ json: { success: true, data: conversation } });
    }
    if (path === '/dashboard') return route.fulfill({ json: { data: { statuses: {}, total: 0, unassigned: 0 } } });
    return route.fulfill({ json: { success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } } });
  });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 700 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/conversations/channel-test');
    const trigger = page.locator('.composer-channel-pill');
    await trigger.scrollIntoViewIfNeeded();
    // Both sides fit, but there is more space above: still prefer opening below.
    await page.locator('.composer-channel-control').evaluate(element => {
      Object.assign((element as HTMLElement).style, { position: 'fixed', top: `${window.innerHeight - 300}px`, right: '20px', zIndex: '100' });
    });
    await trigger.dblclick();
    const preferred = page.locator('.composer-channel-popover');
    await expect(preferred).toBeVisible();
    expect((await preferred.boundingBox())!.y).toBeGreaterThan((await trigger.boundingBox())!.y);
    await page.keyboard.press('Escape');
    await expect(preferred).toHaveCount(0);
    await page.locator('.composer-channel-control').evaluate(element => (element as HTMLElement).removeAttribute('style'));
    await trigger.scrollIntoViewIfNeeded();
    await trigger.dblclick();
    const menu = page.getByRole('dialog', { name: 'Yanıt Kanallarını Seçin' });
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await menu.getByRole('checkbox', { name: 'WhatsApp', exact: true }).check();
    const save = menu.getByRole('button', { name: 'Kaydet', exact: true });
    await expect(save).toBeInViewport();
    await save.click();
    await expect(menu).toHaveCount(0);
    expect(patches.at(-1)).toEqual({ replyChannels: expect.arrayContaining(['FORM', 'WHATSAPP']) });
  }
});
