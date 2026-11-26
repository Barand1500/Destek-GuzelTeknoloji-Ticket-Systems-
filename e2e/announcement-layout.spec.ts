import { test, expect, type Page } from "@playwright/test";

async function workspace(page: Page, role = "ADMIN") {
  const searches: string[] = [];
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/v1/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const empty = { success: true, data: [], pagination: { page: 1, totalPages: 1, total: 0, limit: 8 } };
    if (path === "/auth/refresh") return route.fulfill({ json: { success: true, data: { accessToken: "test", user: { id: "user", name: "Test", role } } } });
    if (path === "/announcements/directory") return route.fulfill({ json: { success: true, data: { people: [], departments: [], smsEnabled: false, emailEnabled: false, maxFileSize: 10485760 } } });
    if (path === "/notifications") return route.fulfill({ json: { ...empty, unreadCount: 1, data: [{ id: "notice", type: "ANNOUNCEMENT", title: "Toplantı", message: "Duyuru metni", createdAt: new Date().toISOString() }] } });
    if (path === "/announcements") {
      searches.push(url.searchParams.get("search") ?? "");
      return route.fulfill({ json: { ...empty, data: [{ id: "announcement", title: "Toplantı", body: "Duyuru metni", authorName: "Yönetici", priority: "NORMAL", departmentName: null, createdAt: new Date().toISOString(), eventAt: null, pinned: false, files: [], deliveries: [] }] } });
    }
    return route.fulfill({ json: empty });
  });
  return searches;
}

test("announcement backdrop stays open and history search reaches the API", async ({ page }) => {
  const searches = await workspace(page);
  await page.goto("/admin/websites");
  await page.getByRole("button", { name: "Duyurular", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Duyurular", exact: true });
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 500);
  await expect(dialog).toBeVisible();
  await page.mouse.click(1435, 500);
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Duyuru geçmişi", exact: true }).click();
  const searchBox = (await page.locator(".announcement-history-search").boundingBox())!;
  expect(searchBox.height).toBeLessThanOrEqual(38);
  await page.getByRole("searchbox", { name: "Geçmiş duyurularda ara" }).fill("toplantı");
  await expect.poll(() => searches.at(-1)).toBe("toplantı");
  await page.getByRole("button", { name: "Duyuruları kapat" }).click();
  await expect(dialog).not.toBeVisible();
});

test("supervisor announcement notification opens a reading view without publishing controls", async ({ page }) => {
  await workspace(page, "SUPERVISOR");
  await page.goto("/agent/customers");
  await page.getByRole("button", { name: "Bildirimler", exact: true }).click();
  await page.locator(".notification-popover-item").first().click();
  const dialog = page.getByRole("dialog", { name: "Duyurular", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Yeni duyuru", exact: true })).toHaveCount(0);
  await expect(dialog.locator(".announcement-history-item")).toContainText("Toplantı");
});

test("calendar fills the viewport without scrolling and keeps its size across months", async ({ page }) => {
  await workspace(page);
  await page.goto("/admin/calendar");
  const today = page.getByRole("button", { name: "Bugün", exact: true });
  await expect(today).toBeVisible();
  const todayBox = (await today.boundingBox())!;
  const arrows = (await page.locator(".calendar-toolbar > div").boundingBox())!;
  expect(todayBox.x).toBeGreaterThan(arrows.x + arrows.width);
  await expect(page.locator(".calendar-cell")).toHaveCount(42);
  const initial = (await page.locator(".calendar-modal").boundingBox())!;
  expect(initial.y + initial.height).toBeLessThanOrEqual(1000);
  expect(initial.y + initial.height).toBeGreaterThan(950);
  for (let index = 0; index < 12; index++) {
    await page.getByRole("button", { name: "Sonraki ay", exact: true }).click();
    const box = (await page.locator(".calendar-modal").boundingBox())!;
    expect(Math.abs(box.height - initial.height)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  }
  await page.screenshot({ path: ".local/calendar-layout.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  const mobile = (await page.locator(".calendar-modal").boundingBox())!;
  await page.getByRole("button", { name: "Sonraki ay", exact: true }).click();
  expect(Math.abs((await page.locator(".calendar-modal").boundingBox())!.height - mobile.height)).toBeLessThan(1);
  await page.screenshot({ path: ".local/calendar-mobile.png", fullPage: true });
});

test("monthly calendar hides adjacent dates without changing grid size", async ({ page }) => {
  await page.clock.install({ time: new Date("2027-01-01T12:00:00+03:00") });
  await workspace(page);
  await page.goto("/admin/calendar");
  const calendar = page.locator(".calendar-modal");
  const fitsViewport = async () => {
    for (const [width, height] of [[2560, 1440], [1440, 900], [1366, 768], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const bounds = await calendar.boundingBox();
      expect(bounds!.width).toBeGreaterThan(width < 600 ? width - 60 : width - 340);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
      const lastDay = calendar.locator('.calendar-day-number').last();
      await expect(lastDay).toBeInViewport();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  };
  await fitsViewport();
  await expect(calendar.locator(".calendar-cell")).toHaveCount(35);
  await expect(calendar.locator(".calendar-day-number")).toHaveCount(31);
  await expect(calendar.locator(".calendar-day-number").first()).toHaveText("1");
  await expect(calendar.locator(".calendar-day-number").last()).toHaveText("31");
  await expect(calendar.locator('.calendar-cell-empty')).toHaveCount(4);
  await expect(calendar.locator('.calendar-cell-empty[role], .calendar-cell-empty[tabindex]')).toHaveCount(0);
  const height = (await calendar.boundingBox())!.height;
  await expect(calendar.locator(".calendar-cell.today > span")).toHaveText("1");
  await page.getByRole("button", { name: "Önceki Ay", exact: true }).click();
  await expect(calendar.locator("h2")).toHaveText("Aralık 2026");
  await page.getByRole("button", { name: "Bugün", exact: true }).click();
  expect(Math.abs((await calendar.boundingBox())!.height - height)).toBeLessThan(1);
  await expect(calendar.locator(".calendar-cell")).toHaveCount(35);
  await expect(calendar.locator("h2")).toHaveText("Ocak 2027");
  await page.getByRole('button', { name: 'Sonraki Ay', exact: true }).click();
  await expect(calendar.locator('.calendar-day-number')).toHaveCount(28);
  await expect(calendar.locator('.calendar-cell')).toHaveCount(28);
  expect(Math.abs((await calendar.boundingBox())!.height - height)).toBeLessThan(1);
  await fitsViewport();
  await page.getByRole('button', { name: 'Gece Moduna Geç', exact: true }).click();
  for (let month = 0; month < 3; month++) await page.getByRole('button', { name: 'Sonraki Ay', exact: true }).click();
  await expect(calendar.locator('.calendar-cell')).toHaveCount(42);
  await fitsViewport();
  expect(Math.abs((await calendar.boundingBox())!.height - height)).toBeLessThan(1);
  for (let month = 0; month < 3; month++) await page.getByRole('button', { name: 'Önceki Ay', exact: true }).click();
  await page.screenshot({ path: 'test-results/calendar-current-month.png', fullPage: true });
  await calendar.getByRole('button', { name: /^1 Şubat 2027/ }).click();
  await expect(page.getByRole('dialog', { name: 'Günün Detayları' })).toBeVisible();
});

for (const role of ["SUPERVISOR", "AGENT"]) {
  test(`${role} sees calendar and saved replies in the bottom toolbar`, async ({ page }) => {
    await workspace(page, role);
    await page.goto("/agent/customers");
    const bottom = page.locator(".sidebar-bottom");
    const calendar = bottom.getByRole("link", { name: "Takvim", exact: true });
    const replies = bottom.getByRole("link", { name: "Hazır yanıtlar", exact: true });
    await expect(calendar).toBeVisible();
    await expect(replies).toBeVisible();
    await expect(bottom.getByRole("link", { name: "İşlem geçmişi", exact: true })).toHaveCount(0);
    await calendar.click();
    await expect(page).toHaveURL(/\/agent\/calendar$/);
    await expect(page.locator(".calendar-cell")).toHaveCount(42);
    await replies.click();
    await expect(page).toHaveURL(/\/agent\/saved-replies$/);
    await expect(page.getByRole("heading", { name: "Hazır yanıtlar", exact: true })).toBeVisible();
  });
}

test("calendar day details retain multiple announcements without note controls", async ({ page }) => {
  await page.clock.install({ time: new Date("2027-01-01T12:00:00+03:00") });
  await workspace(page);
  await page.route("**/api/v1/announcements?**", route => route.fulfill({ json: {
    success: true,
    pagination: { page: 1, totalPages: 1, total: 2, limit: 100 },
    data: [1, 2].map(index => ({ id: `day-${index}`, title: `Duyuru ${index}`, body: `İçerik ${index}`, authorName: "Yönetici", eventAt: "2027-01-01T12:00:00+03:00", createdAt: "2027-01-01T12:00:00+03:00", priority: "NORMAL" })),
  } }));
  await page.goto("/admin/calendar");
  const day = page.getByRole("button", { name: "1 Ocak 2027", exact: true });
  await expect(day).toContainText("+1");
  await day.click();
  const dialog = page.getByRole("dialog", { name: "Günün detayları", exact: true });
  await expect(dialog.locator(".calendar-day-announcement")).toHaveCount(2);
  await expect(dialog).toContainText("İçerik 1");
  await expect(dialog).toContainText("İçerik 2");
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await page.screenshot({ path: ".local/calendar-day-details.png", fullPage: true });
  await dialog.getByRole("button", { name: "Günün detaylarını kapat" }).click();
  await expect(dialog).not.toBeVisible();
});
