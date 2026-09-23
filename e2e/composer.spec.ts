import { test, expect } from '@playwright/test';

test('Enter sends once, Shift+Enter adds a line, and attachments occupy the left side', async ({ page }) => {
  const customer = { id: 'customer-test', name: 'Test Müşteri', role: 'CUSTOMER', email: 'customer@example.test' };
  const conversation = { id: 'composer-test', number: 1, subject: 'Mesaj alanı testi', channel: 'TICKET', status: 'OPEN', priority: 'NORMAL', customer, customerId: customer.id, assignedAgent: null, assignedAgentId: null, department: { id: 'department-test', name: 'Destek' }, departmentId: 'department-test', tags: [], createdAt: '2026-09-22T14:18:00.000Z' };
  const empty = { success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } };
  const submissions: string[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { success: true, data: { accessToken: 'test-token', user: { id: 'admin-test', name: 'Admin', role: 'ADMIN' } } } });
    if (path === '/conversations/composer-test/messages' && request.method() === 'POST') {
      submissions.push(request.postDataBuffer()?.toString('utf8') ?? '');
      if (submissions.length === 1) {
        await pending;
        return route.fulfill({ status: 500, json: { success: false, error: { message: 'Test gönderim hatası' } } });
      }
      return route.fulfill({ json: { success: true, data: {} } });
    }
    if (path === '/conversations/composer-test') return route.fulfill({ json: { success: true, data: conversation } });
    if (path === '/dashboard') return route.fulfill({ json: { success: true, data: { statuses: {}, total: 0, unassigned: 0 } } });
    return route.fulfill({ json: empty });
  });
  await page.goto('/admin/conversations/composer-test');
  const input = page.getByRole('textbox', { name: 'Yanıtınız', exact: true });
  await input.fill('   ');
  await input.press('Enter');
  expect(submissions).toHaveLength(0);
  await input.fill('İlk satır');
  await input.press('Shift+Enter');
  await input.pressSequentially('Ikinci satir');
  await expect(input).toHaveValue('İlk satır\nIkinci satir');
  expect(submissions).toHaveLength(0);
  await page.getByLabel('Dosya ekle', { exact: true }).setInputFiles([
    { name: 'dosya-bir.txt', mimeType: 'text/plain', buffer: Buffer.from('one') },
    { name: 'dosya-iki.txt', mimeType: 'text/plain', buffer: Buffer.from('two') },
  ]);
  const fileList = page.getByRole('list', { name: 'Gönderilecek dosyalar' });
  await expect(fileList.getByRole('listitem')).toHaveCount(2);
  const fileBox = await fileList.boundingBox(), toolsBox = await page.locator('.composer-tools').boundingBox();
  expect(fileBox!.x + fileBox!.width).toBeLessThanOrEqual(toolsBox!.x);
  await page.getByRole('button', { name: 'dosya-iki.txt kaldır' }).click();
  await expect(fileList.getByRole('listitem')).toHaveCount(1);
  await input.press('Enter');
  await expect.poll(() => submissions.length).toBe(1);
  await expect(input).toBeDisabled();
  await page.keyboard.press('Enter');
  expect(submissions).toHaveLength(1);
  release();
  await expect(page.getByText('Test gönderim hatası')).toBeVisible();
  await expect(input).toHaveValue('İlk satır\nIkinci satir');
  await expect(fileList.getByRole('listitem')).toHaveCount(1);
  await input.press('Enter');
  await expect.poll(() => submissions.length).toBe(2);
  await expect(input).toHaveValue('');
  await expect(fileList.getByRole('listitem')).toHaveCount(0);
  expect(submissions[1]).toContain('dosya-bir.txt');
  expect(submissions[1]).not.toContain('dosya-iki.txt');
  await page.getByRole('button', { name: 'Dahili not', exact: true }).click();
  const note = page.getByRole('textbox', { name: 'Dahili not', exact: true });
  await note.fill('Ekip notu');
  await note.press('Enter');
  await expect.poll(() => submissions.length).toBe(3);
  expect(submissions[2]).toContain('INTERNAL_NOTE');
  await expect(note).toHaveValue('');
});
