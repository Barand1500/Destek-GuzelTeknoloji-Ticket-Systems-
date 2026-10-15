import { test, expect } from '@playwright/test';

test('notification sorting cycles and resets; long messages and actions stay inside the hover row', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const user = { id: 'test-admin', name: 'Test Yönetici', email: 'test@example.test', role: 'ADMIN', departmentIds: [] };
  const rows = [
    { id: 'new', title: 'Middle Bildirim', message: 'Çok uzun bildirim mesajı '.repeat(30), createdAt: '2026-10-15T10:00:00Z', isRead: false, conversationId: 'test-conversation' },
    { id: 'old', title: 'Zulu Bildirim', message: 'Zulu mesaj', createdAt: '2026-10-13T10:00:00Z', isRead: false },
    { id: 'middle', title: 'Alpha Bildirim', message: 'Alpha mesaj', createdAt: '2026-10-14T10:00:00Z', isRead: false },
  ];
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/refresh')) return route.fulfill({ json: { success: true, data: { user, accessToken: 'test-token' } } });
    if (url.pathname.endsWith('/notifications')) {
      const field = url.searchParams.get('sortBy');
      const direction = url.searchParams.get('sortDirection') === 'desc' ? -1 : 1;
      const sorted = field ? [...rows].sort((a, b) => direction * String(a[field as keyof typeof a] ?? '').localeCompare(String(b[field as keyof typeof b] ?? ''), 'tr')) : rows;
      return route.fulfill({ json: { success: true, data: sorted, unreadCount: 3, pagination: { page: 1, limit: 15, total: 3, totalPages: 1 } } });
    }
    if (url.pathname.endsWith('/notification-count')) return route.fulfill({ json: { success: true, data: { count: 3 } } });
    return route.fulfill({ json: { success: true, data: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 0 } } });
  });
  await page.goto('/admin/notifications');
  const table = page.getByRole('table', { name: 'Bildirimler', exact: true });
  await expect(table).toBeVisible();
  const titleHeader = table.getByRole('columnheader').filter({ has: page.getByRole('button', { name: 'Bildirim', exact: false }) });
  const titleSort = table.getByRole('button', { name: /^Bildirim/ });
  const firstTitle = table.locator('tbody tr:first-child td:first-child');
  await expect(firstTitle).toHaveText('Middle Bildirim');
  await titleSort.click();
  await expect(firstTitle).toHaveText('Alpha Bildirim');
  await expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');
  await titleSort.click();
  await expect(firstTitle).toHaveText('Zulu Bildirim');
  await expect(titleHeader).toHaveAttribute('aria-sort', 'descending');
  await titleSort.click();
  await expect(firstTitle).toHaveText('Middle Bildirim');
  await titleSort.click();
  await table.getByRole('button', { name: /^Tarih/ }).click();
  await expect(firstTitle).toHaveText('Zulu Bildirim');
  await expect(titleHeader).toHaveAttribute('aria-sort', 'none');
  await table.getByRole('button', { name: 'Varsayılan Sıralamaya Dön', exact: true }).click();
  await expect(firstTitle).toHaveText('Middle Bildirim');
  for (const width of [1440, 1100, 800]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await table.evaluate(element => {
      const wrap = element.parentElement!;
      const row = element.querySelector('tbody tr')!;
      const action = row.querySelector('td:last-child > div')!;
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
        tableWidth: element.getBoundingClientRect().width,
        wrapWidth: wrap.clientWidth,
        actionRight: action.getBoundingClientRect().right,
        rowRight: row.getBoundingClientRect().right,
        scrollbar: getComputedStyle(wrap).scrollbarWidth,
      };
    });
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.actionRight).toBeLessThanOrEqual(layout.rowRight + 1);
    expect(layout.scrollbar).toBe('thin');
    if (width >= 1100) expect(layout.tableWidth).toBeLessThanOrEqual(layout.wrapWidth + 1);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await table.locator('tbody tr:first-child').hover();
  const backgrounds = await table.locator('tbody tr:first-child td').evaluateAll(cells => cells.map(cell => getComputedStyle(cell).backgroundColor));
  expect(new Set(backgrounds).size).toBe(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'output/notification-sorting-layout.png', fullPage: true });
});

test('all management tables expose three-state sortable columns and a working reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const user = { id: 'admin', name: 'Test Yönetici', email: 'test@example.test', role: 'ADMIN', departmentIds: [] };
  const item = { id: 'test-item', name: 'Örnek kayıt', email: 'test@example.test', role: 'AGENT', isActive: true, code: 'TEST', color: '#64748b', title: 'Örnek başlık', label: 'Örnek şablon', body: 'Örnek metin', authorId: 'admin', author: { id: 'admin', name: 'Test Yönetici' }, url: 'https://example.test', skills: [], departments: [{ departmentId: 'department', department: { id: 'department', name: 'Test Departman' } }], createdAt: '2026-10-15T10:00:00Z', action: 'conversation.created', user, metadata: { subject: 'Test talep' } };
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/auth/refresh')) return route.fulfill({ json: { success: true, data: { user, accessToken: 'test-token' } } });
    if (pathname.endsWith('/skill-catalog')) return route.fulfill({ json: { success: true, data: { categories: [{ id: 'category', kind: 'category', name: 'Test kategori', rank: 1 }], skills: [{ id: 'skill', kind: 'skill', name: 'Test yetenek', categoryId: 'category', rank: 1 }], levels: [{ id: 'level', kind: 'level', name: 'Test seviye', rank: 1 }] } } });
    if (pathname.endsWith('/users')) return route.fulfill({ json: { success: true, data: [{ ...item, name: 'Çok Uzun Personel Adı '.repeat(6), email: 'uzun.personel.eposta.adresi@example.test', departments: [{ departmentId: 'department', department: { id: 'department', name: 'Eğitim Destek, Satış Pazarlama, Muhasebe, Muhaberat, Teknik Destek' } }] }], pagination: { page: 1, limit: 15, total: 1, totalPages: 1 } } });
    return route.fulfill({ json: { success: true, data: [item], pagination: { page: 1, limit: 15, total: 1, totalPages: 1 } } });
  });
  const screens = [
    ['/admin/users', ['Kullanıcı', 'Rol ve Departman']],
    ['/admin/departments', ['Departman']],
    ['/admin/tags', ['Görünen Ad', 'Sistem Kodu']],
    ['/admin/tags?section=statuses', ['Durum', 'Kod']],
    ['/admin/tags?section=priorities', ['Öncelik', 'Kod']],
    ['/admin/websites', ['Ad', 'URL']],
    ['/admin/saved-replies', ['Yanıt Başlığı', 'Yanıt Metni', 'Ekleyen']],
    ['/admin/saved-replies?tab=templates', ['Şablon Adı', 'Duyuru Başlığı', 'İçerik']],
    ['/admin/activity-logs', ['Tarih', 'Kullanıcı', 'İşlem', 'Açıklama']],
    ['/admin/tags/skills', ['Ad', 'Yetenek Sayısı']],
  ] as const;
  for (const [url, columns] of screens) {
    await page.goto(url);
    const table = page.locator('main .management-table').first();
    await expect(table).toBeVisible();
    expect(await table.evaluate(element => getComputedStyle(element.parentElement!).scrollbarWidth)).toBe('thin');
    for (const label of columns) {
      const button = table.getByRole('button', { name: label, exact: true });
      const header = button.locator('..').locator('..');
      await button.click(); await expect(header).toHaveAttribute('aria-sort', 'ascending');
      await button.click(); await expect(header).toHaveAttribute('aria-sort', 'descending');
      await button.click(); await expect(header).toHaveAttribute('aria-sort', 'none');
    }
    await table.getByRole('button', { name: columns[0], exact: true }).click();
    await table.getByRole('button', { name: 'Varsayılan Sıralamaya Dön', exact: true }).click();
    await expect(table.locator('th[aria-sort="ascending"], th[aria-sort="descending"]')).toHaveCount(0);
    if (url === '/admin/users') {
      for (const width of [1440, 1100, 800, 480]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await table.evaluate(element => {
          const wrap = element.parentElement!;
          const text = element.querySelector('.users-cell-text')!;
          const cells = Array.from(element.querySelectorAll('tbody td'));
          return { scroll: wrap.scrollWidth, width: wrap.clientWidth, ellipsis: getComputedStyle(text).textOverflow, overlap: cells.some(cell => Array.from(cell.children).some(child => child.getBoundingClientRect().right > cell.getBoundingClientRect().right + 1)) };
        });
        expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
        expect(layout.ellipsis).toBe('ellipsis');
        expect(layout.overlap).toBe(false);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: 'output/staff-table-ellipsis.png', fullPage: true });
    }
  }
  for (const tab of ['Yetenekler', 'Seviyeler']) {
    await page.getByRole('navigation', { name: 'Yetenek Yönetimi Bölümleri' }).getByRole('button', { name: tab, exact: true }).click();
    const table = page.locator('main .management-table').first();
    const name = table.getByRole('button', { name: 'Ad', exact: true });
    await name.click();
    await expect(table.locator('th[aria-sort="ascending"]')).toHaveCount(1);
    await table.getByRole('button', { name: 'Varsayılan Sıralamaya Dön', exact: true }).click();
  }
  expect(errors).toEqual([]);
});
