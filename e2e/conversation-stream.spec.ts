import { test, expect } from '@playwright/test';

test('conversation has a continuous stream, follows new replies and loads older messages on upward scroll', async ({ page }) => {
  const customer = { id: 'customer', name: 'Customer', role: 'CUSTOMER', email: 'customer@example.test' };
  const admin = { id: 'admin', name: 'Admin', role: 'ADMIN' };
  const conversation = { id: 'stream', number: 1, subject: 'Stream test', channel: 'TICKET', status: 'OPEN', priority: 'NORMAL', customer, customerId: customer.id,
    assignedAgent: null, assignedAgentId: null, department: { id: 'department', name: 'Support' }, tags: [], createdAt: new Date().toISOString() };
  const entries = Array.from({ length: 100 }, (_, i) => ({ id: `message-${i + 1}`, conversationId: 'stream', body: `Message ${i + 1}`, type: 'CUSTOMER_MESSAGE',
    author: customer, createdAt: new Date(Date.UTC(2026, 9, 17, 10, i)).toISOString(), attachments: [] }));
  const empty = { success: true, data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } };
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { success: true, data: { accessToken: 'test', user: admin } } });
    if (path === '/conversations/stream') return route.fulfill({ json: { success: true, data: conversation } });
    if (path === '/conversations/stream/messages') {
      if (request.method() === 'POST') {
        entries.push({ ...entries[99], id: 'message-101', body: 'New reply', type: 'AGENT_REPLY', author: { ...customer, ...admin }, createdAt: new Date().toISOString() });
        return route.fulfill({ json: { success: true, data: entries.at(-1) } });
      }
      const current = Number(url.searchParams.get('page') || 1), limit = Number(url.searchParams.get('limit') || 25);
      return route.fulfill({ json: { success: true, data: entries.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total: entries.length, totalPages: Math.ceil(entries.length / limit) } } });
    }
    return route.fulfill({ json: empty });
  });
  await page.goto('/admin/conversations/stream');
  const list = page.locator('.message-list');
  await expect(list.getByText('Message 100', { exact: true })).toBeVisible();
  await expect(list.getByText('Message 51', { exact: true })).toBeAttached();
  await expect(list.getByText('Message 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Sayfa \d+$/)).toHaveCount(0);
  const input = page.getByRole('textbox', { name: 'Yanıtınız', exact: true });
  await input.fill('New reply'); await input.press('Enter');
  await expect(list.getByText('New reply', { exact: true })).toBeVisible();
  await expect(list.getByText('Message 51', { exact: true })).toBeAttached();
  await expect(page.getByText('101 mesaj', { exact: true })).toBeVisible();
  await list.hover(); await page.mouse.wheel(0, -100000);
  await expect(list.getByText('Message 1', { exact: true })).toBeAttached();
  // Loading history keeps the viewport near the old start rather than jumping to the newest reply.
  await expect.poll(() => list.evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeGreaterThan(100);
  await expect(list.locator('.message')).toHaveCount(101);
});
