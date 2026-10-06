import { test, expect } from '@playwright/test';
import { permissionGroups, permissionKeys, templatePermissions } from '../backend/src/services/permissions';

test('role editor: permission dependencies, saved selection and responsive themes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const role = { id: 'role-preview', name: 'Kıdemli destek', description: 'Talepleri yöneten deneyimli destek ekibi', scope: 'DEPARTMENT', permissions: ['conversations.view', 'conversations.reply', 'conversations.note', 'conversations.assign'], _count: { users: 3 } };
  let saved: typeof role | undefined;
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { success: true, data: { accessToken: 'preview', user: { id: 'preview-admin', role: 'ADMIN', name: 'Yunus' } } } });
    if (path === '/roles' && request.method() === 'GET') return route.fulfill({ json: { success: true, data: [saved ?? role], groups: permissionGroups, templates: ['ADMIN', 'SUPERVISOR', 'AGENT'].map(id => ({ id, permissions: templatePermissions(id), scope: id === 'ADMIN' ? 'ALL' : 'DEPARTMENT' })) } });
    if (path === '/roles/' + role.id && request.method() === 'PATCH') { saved = { ...role, ...request.postDataJSON() }; return route.fulfill({ json: { success: true, data: saved } }); }
    return route.fulfill({ json: { success: true, data: [], unreadCount: 0, pagination: { page: 1, total: 0, totalPages: 0, limit: 25 } } });
  });
  await page.goto('/admin/roles');
  await expect(page.getByRole('heading', { name: 'Roller', exact: true })).toBeVisible();
  await expect(page.locator('.roles-name-cell strong')).toHaveText('Kıdemli destek');
  await page.screenshot({ path: '.local/roles-overview-light.png', fullPage: true });
  await page.getByRole('button', { name: 'Düzenle', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Rolü düzenle' })).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Yanıt yazma', exact: true })).toBeChecked();
  const row = page.locator('.roles-permission-row').first();
  expect(await row.evaluate(element => getComputedStyle(element).flexDirection)).toBe('row');
  await page.screenshot({ path: '.local/roles-editor-light.png', fullPage: true });
  await page.getByRole('checkbox', { name: 'Görüntüleme', exact: true }).uncheck();
  await expect(page.getByRole('checkbox', { name: 'Yanıt yazma', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Yanıt yazma', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'Görüntüleme', exact: true })).toBeChecked();
  await page.getByRole('navigation', { name: 'Yetki alanları' }).getByRole('button', { name: /^Müşteriler/ }).click();
  await page.getByRole('button', { name: 'Tümünü seç', exact: true }).click();
  for (const name of ['Görüntüleme', 'Ekleme', 'Düzenleme', 'Silme']) await expect(page.getByRole('checkbox', { name, exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Seçimi kaldır', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Düzenleme', exact: true }).check();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: '.local/roles-editor-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/roles-editor-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Rolü kaydet', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Roller', exact: true })).toBeVisible();
  expect(saved?.permissions.slice().sort()).toEqual(['conversations.view', 'conversations.reply', 'customers.view', 'customers.update'].sort());
  expect(saved?.permissions.every(key => permissionKeys.includes(key))).toBe(true);
  expect(errors).toEqual([]);
});
