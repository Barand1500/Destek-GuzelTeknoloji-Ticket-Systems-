import { test, expect } from '@playwright/test';

test('management tables keep their rows and separators inside the panel while scrolling', async ({ page }) => {
  const empty = { success: true, data: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 1 } };
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (path === '/auth/refresh') return route.fulfill({ json: { data: { accessToken: 'test', user: { id: 'admin', name: 'Admin', role: 'ADMIN' } } } });
    const records: Record<string, unknown[]> = {
      '/customers': Array.from({ length: 4 }, (_, i) => ({ id: `customer-${i}`, name: `Müşteri ${i + 1}`, email: `customer-${i}@example.test`, phone: '05421046060', company: 'Uzun Şirket Ticaret ve Teknoloji Limited Şirketi', staffNote: 'Birleştirilen müşteri hakkında uzun personel notu', role: 'CUSTOMER' })),
      '/users': Array.from({ length: 4 }, (_, i) => ({ id: `staff-${i}`, name: `Destek Personeli ${i + 1}`, email: `staff-${i}@example.test`, role: 'AGENT', isActive: true, departments: [], skills: [] })),
      '/tags': [{ id: 'tag', name: 'Uzun Kategori Adı', code: 'CUSTOM_CATEGORY', color: '#167766' }],
      '/websites': Array.from({ length: 4 }, (_, i) => ({ id: `project-${i}`, name: `Uzun Proje Adı ${i + 1}`, url: 'https://uzunproje.example.test', isActive: true, guideFileCount: 0 })),
      '/saved-replies': Array.from({ length: 4 }, (_, i) => ({ id: `reply-${i}`, title: `Hazır Yanıt Başlığı ${i + 1}`, body: 'Uzun hazır yanıt içeriği. Müşteriye iletilecek açıklama ve ayrıntılı destek metni.', authorId: 'admin', author: { name: 'Destek Personeli' } })),
    };
    const data = records[path];
    return route.fulfill({ json: data ? { ...empty, data, pagination: { page: 1, limit: 15, total: data.length, totalPages: 1 } } : empty });
  });
  const screens = [
    ['customers', '.customer-list-table'], ['users', '.users-table'], ['tags', '.catalog-table'], ['websites', '.projects-table'], ['saved-replies', '.saved-content-table'],
  ];
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, selector] of screens) {
      await page.goto(`/admin/${path}`);
      const table = page.locator(selector).first();
      await expect(table.locator('tbody tr').first()).toBeVisible();
      const wrap = table.locator('..');
      await expect(table).toHaveCSS('display', 'table');
      await expect(table).toHaveCSS('border-collapse', 'separate');
      const panel = await wrap.locator('..').boundingBox(), box = await wrap.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(panel!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(panel!.x + panel!.width);
      for (const fraction of [0, 0.5, 1]) {
        await wrap.evaluate((node, value) => { node.scrollLeft = (node.scrollWidth - node.clientWidth) * value; }, fraction);
        const cells = await table.locator('tbody tr:first-child td').evaluateAll(items => items.map(item => {
          const style = getComputedStyle(item);
          return { border: style.borderBottomWidth, color: style.borderBottomColor, height: item.getBoundingClientRect().height };
        }));
        expect(cells.length).toBeGreaterThan(1);
        for (const cell of cells) { expect(cell.border).toBe('1px'); expect(cell.color).not.toBe('rgba(0, 0, 0, 0)'); expect(cell.height).toBeCloseTo(cells[0].height, 0); }
      }
      if (width === 390) await page.screenshot({ path: `.local/table-scroll-${path}.png`, fullPage: true, animations: 'disabled' });
    }
  }
});
