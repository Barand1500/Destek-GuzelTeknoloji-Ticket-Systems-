import { test, expect } from '@playwright/test';

test('ticket assignees can be selected together and removed independently', async ({ page }) => {
  const a = { id: 'agent-a', name: 'Baran', role: 'AGENT', email: 'a@example.test' };
  const b = { id: 'agent-b', name: 'Yunus', role: 'SUPERVISOR', email: 'b@example.test' };
  const longName = { id: 'agent-long', name: 'Destek Uzmanlığı Çok Uzun Personel Adı', displayName: 'Destek Uzmanlığı Çok Uzun Personel Adı (Yönetici)', role: 'ADMIN', email: 'long@example.test' };
  const customer = { id: 'customer', name: 'Customer', role: 'CUSTOMER', email: 'customer@example.test' };
  let conversation = { id: 'multiple', number: 1, subject: 'Multiple assignees', channel: 'TICKET', status: 'OPEN', priority: 'NORMAL', customer, customerId: customer.id,
    assignedAgent: a as typeof a | null, assignedAgentId: a.id as string | null, assignees: [{ userId: a.id, user: a }], departmentId: 'department', department: { id: 'department', name: 'Support' }, tags: [], createdAt: new Date().toISOString() };
  const writes: string[][] = [];
  const empty = { success: true, data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } };
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { success: true, data: { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } } } });
    if (path === '/conversations/multiple') {
      if (request.method() === 'PATCH') {
        const { assignedAgentIds } = request.postDataJSON();
        writes.push(assignedAgentIds);
        const users = [a, b].filter(user => assignedAgentIds.includes(user.id));
        conversation = { ...conversation, assignees: users.map(user => ({ userId: user.id, user })), assignedAgent: users[0] ?? null, assignedAgentId: users[0]?.id ?? null };
      }
      return route.fulfill({ json: { success: true, data: conversation } });
    }
    if (path === '/departments/department/agents') return route.fulfill({ json: { ...empty, data: [a, b, longName].map(user => ({ ...user, openConversationCount: 1, presence: 'ONLINE' })) } });
    if (path === '/staff-presence') return route.fulfill({ json: { success: true, data: { staff: [a, b, longName].map(user => ({ id: user.id, state: 'ONLINE' })) } } });
    return route.fulfill({ json: empty });
  });
  await page.goto('/admin/conversations/multiple');
  const selector = page.getByRole('button', { name: 'Atanan Personeller', exact: true });
  await expect(selector).toHaveText('Baran');
  await selector.click();
  const longOption = page.getByRole('option', { name: new RegExp(longName.name) });
  await expect(longOption).not.toContainText('(Yönetici)');
  const nameBox = await longOption.locator('.dropdown-option-label').boundingBox();
  const detailsBox = await longOption.locator('.dropdown-option-details').boundingBox();
  expect(nameBox!.x + nameBox!.width).toBeLessThan(detailsBox!.x);
  const otherDetails = await page.getByRole('option', { name: /Yunus/ }).locator('.dropdown-option-details').boundingBox();
  expect(Math.abs(detailsBox!.x - otherDetails!.x)).toBeLessThan(1);
  await page.getByRole('option', { name: /Yunus/ }).click();
  await expect(selector).toContainText('Baran, Yunus');
  expect(writes[0]).toEqual([a.id, b.id]);
  await page.getByRole('option', { name: /Baran/ }).click();
  await expect(selector).toHaveText('Yunus');
  expect(writes[1]).toEqual([b.id]);
  await page.getByRole('option', { name: /Yunus/ }).click();
  await expect(selector).toHaveText('Atanmamış');
  expect(writes[2]).toEqual([]);
});

test('new phone requests submit every selected agent and accept a short subject', async ({ page }) => {
  const customer = { id: 'customer', name: 'Customer', role: 'CUSTOMER', phone: '05551234567' };
  const department = { id: 'department', name: 'Support' };
  const agents = [{ id: 'a', name: 'Baran' }, { id: 'b', name: 'Yunus' }];
  const empty = { success: true, data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } };
  const writes: Array<{ assignedAgentIds: string[]; subject: string }> = [];
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { success: true, data: { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } } } });
    if (path === '/customers/customer') return route.fulfill({ json: { success: true, data: customer } });
    if (path === '/communication-channels') return route.fulfill({ json: { success: true, data: { EMAIL: false, SMS: false, WHATSAPP: false, defaultDepartment: department } } });
    if (path === '/departments/department/agents') return route.fulfill({ json: { ...empty, data: agents } });
    if (path === '/departments') return route.fulfill({ json: { ...empty, data: [department] } });
    if (path === '/conversations' && request.method() === 'POST') {
      writes.push(request.postDataJSON());
      return route.fulfill({ status: 400, json: { success: false, error: { message: 'Test stops after checking the request' } } });
    }
    return route.fulfill({ json: empty });
  });
  await page.goto('/admin/phone-support?customerId=customer');
  await page.getByRole('textbox', { name: 'Konu', exact: true }).fill('vega');
  await page.getByRole('textbox', { name: 'Açıklama', exact: true }).fill('Test message');
  await page.getByRole('button', { name: 'Atanan Personeli Seçin', exact: true }).click();
  await page.getByRole('option', { name: 'Baran', exact: true }).click();
  await page.getByRole('option', { name: 'Yunus', exact: true }).click();
  await page.getByRole('textbox', { name: 'Konu', exact: true }).click();
  await page.getByRole('button', { name: 'Talebi Kaydet', exact: true }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].assignedAgentIds).toEqual(['a', 'b']);
  expect(writes[0].subject).toEqual('vega');
});
