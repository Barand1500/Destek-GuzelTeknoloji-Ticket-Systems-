import { test, expect, type Page, type Locator } from '@playwright/test';

async function preview(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript(value => localStorage.setItem('helpdesk-theme', value), theme);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/socket.io/**', route => route.abort());
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const user = { id: 'admin', name: 'Test Yönetici', role: 'ADMIN' };
    const other = { id: 'staff', name: 'Test Personel', role: 'AGENT' };
    const now = new Date().toISOString();
    const send = (data: unknown) => route.fulfill({ json: { success: true, data, unreadCount: 1, pagination: { page: 1, total: 1, totalPages: 1, limit: 15 } } });
    if (path === '/auth/refresh') return send({ accessToken: 'theme-preview', user });
    if (path === '/auth/security') return send({ enabled: false, siteKey: null });
    if (path === '/staff-presence') return send({ staff: [], idleMinutes: 5 });
    if (path === '/conversations/check') return send({ id: 'check', number: 528, subject: 'Tema kontrolü', channel: 'EMAIL', status: 'OPEN', priority: 'NORMAL', customer: { id: 'customer', name: 'Örnek Müşteri' }, department: { id: 'dep', name: 'Teknik Destek' }, tags: [], assignees: [], createdAt: now, updatedAt: now });
    if (path === '/conversations/check/messages') return send([
      { id: 'incoming', type: 'CUSTOMER_MESSAGE', author: other, body: 'Normal mesaj', createdAt: now, attachments: [] },
      { id: 'outgoing', type: 'AGENT_REPLY', author: user, body: 'Normal yanıt', createdAt: now, attachments: [] },
      { id: 'note-in', type: 'INTERNAL_NOTE', author: other, body: 'Gelen dahili not', createdAt: now, attachments: [] },
      { id: 'note-out', type: 'INTERNAL_NOTE', author: user, body: 'Giden dahili not', createdAt: now, attachments: [] },
    ]);
    if (path === '/announcements') return send([{ id: 'event', title: 'Genel bilgilendirme', body: 'Duyuru metni', authorName: user.name, createdAt: now, eventAt: now, priority: 'NORMAL' }]);
    if (path === '/notifications') return send([
      { id: 'notice', title: 'Yeni e-posta mesajı', message: 'Görüşme güncellendi.', type: 'MESSAGE', isRead: false, createdAt: now },
      { id: 'linked', title: 'Yeni yanıt', message: 'Görüşmede yeni mesaj var.', type: 'MESSAGE', conversationId: 'check', isRead: false, createdAt: now },
      { id: 'read', title: 'Okunan yanıt', message: 'Önceki mesaj.', type: 'MESSAGE', conversationId: 'check', isRead: true, createdAt: now },
    ]);
    if (path === '/surveys') {
      const survey = { id: 'survey', title: 'Ekip görüşleri', description: 'Süreç değerlendirmesi', active: true, answered: false, anonymous: false, participantCount: 1, recipientCount: 1, completionRate: 100, endsAt: new Date(Date.now() + 86400000).toISOString(), authorName: user.name, questions: [{ id: 'q1', type: 'SINGLE', text: 'Süreç nasıl?', options: ['İyi', 'Geliştirilebilir'], required: true }], responses: [{ respondentName: 'Test Personel', answers: { q1: 'İyi' } }] };
      return send([survey, { ...survey, id: 'finished', title: 'Tamamlanan anket', active: false, endsAt: now }]);
    }
    return send([]);
  });
}

async function contrast(locator: Locator) {
  await expect(locator).toBeVisible();
  return locator.evaluate(element => {
    const rgba = (value: string) => { const c = value.match(/[\d.]+/g)!.map(Number); return c.length === 3 ? [...c, 1] : c; };
    const blend = (a: number[], b: number[]) => [...a.slice(0, 3).map((c, i) => c * a[3] + b[i] * (1 - a[3])), 1];
    const chain: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node);
    const background = chain.reduce((result, node) => blend(rgba(getComputedStyle(node).backgroundColor), result), [255, 255, 255, 1]);
    const foreground = blend(rgba(getComputedStyle(element).color), background);
    const luminance = (color: number[]) => color.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
    const a = luminance(background), b = luminance(foreground);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: survey statistics percentages and finished badge stay legible`, async ({ page }) => {
    await preview(page, theme);
    await page.goto('/admin/surveys');
    const finished = page.locator('.survey-status:not(.active)');
    await expect(finished).toHaveText('Bitti');
    expect(await contrast(finished)).toBeGreaterThanOrEqual(4.5);
    await page.getByRole('button', { name: 'İstatistikler', exact: true }).first().click();
    const percentages = page.locator('.survey-stat-bar strong');
    await expect(percentages).toHaveCount(2);
    await expect(percentages.first()).toContainText('100%');
    await expect(percentages.last()).toContainText('0%');
    for (const percentage of await percentages.all()) expect(await contrast(percentage)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: `.local/survey-statistics-fixed-${theme}.png`, fullPage: true });
  });

  test(`${theme}: internal notes keep their original surface for incoming and outgoing messages`, async ({ page }) => {
    await preview(page, theme);
    await page.goto('/admin/conversations/check');
    await expect(page.locator('.message.internal-note')).toHaveCount(2);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const direction of ['incoming', 'outgoing']) {
        const note = page.locator(`.message.internal-note.${direction}`);
        await expect(note).toHaveCSS('background-color', theme === 'dark' ? 'rgb(58, 53, 32)' : 'rgb(255, 251, 235)');
        const content = note.locator('.message-content');
        await expect(content).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(content).toHaveCSS('border-top-width', '0px');
        await expect(content).toHaveCSS('box-shadow', 'none');
        await expect(note.locator('.note-label')).toHaveCSS('color', 'rgb(170, 130, 50)');
      }
      await expect(page.locator('.message.outgoing:not(.internal-note) .message-content')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    }
  });

  test(`${theme}: calendar, notification and survey text remains readable with populated content`, async ({ page }) => {
    await preview(page, theme);
    await page.goto('/admin/calendar');
    expect(await contrast(page.locator('.calendar-event-title').first())).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(page.locator('.calendar-toolbar > button'))).toBeGreaterThanOrEqual(4.5);
    await page.goto('/admin/notifications');
    expect(await contrast(page.locator('.notification-mark-read').first())).toBeGreaterThanOrEqual(4.5);
    const notificationActions = page.locator('.notification-table .button.secondary, .notification-table .notification-conversation-link');
    await expect(notificationActions).toHaveCount(4);
    const actionColors = await notificationActions.evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderTopColor, color: style.color };
    }));
    expect(new Set(actionColors.map(value => JSON.stringify(value))).size).toBe(1);
    await page.goto('/admin/surveys');
    expect(await contrast(page.locator('.survey-status.active'))).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(page.locator('.survey-vote'))).toBeGreaterThanOrEqual(4.5);
    await page.locator('.survey-vote').click();
    expect(await contrast(page.locator('.survey-answer-options button span').first())).toBeGreaterThanOrEqual(4.5);
    await page.goto('/admin/users');
    expect(await contrast(page.locator('.management-form .button.primary').first())).toBeGreaterThanOrEqual(4.5);
  });
}
