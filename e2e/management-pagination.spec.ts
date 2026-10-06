import { test, expect } from "@playwright/test";

for (const config of [
  { page: "tags", endpoint: "/tags", leading: 4 },
  { page: "websites", endpoint: "/websites", leading: 0 },
  { page: "customers", endpoint: "/customers", leading: 0 },
  { page: "users", endpoint: "/users", leading: 0 },
]) {
  test(`${config.page}: selectable server pagination, page reset and small search results`, async ({ page }) => {
    const requests: URL[] = [];
    const records = Array.from({ length: 63 }, (_, index) => ({ id: `record-${index + 1}`, name: `Kayıt ${String(index + 1).padStart(2, "0")}`, code: `TAG${index + 1}`, color: "#167766", isActive: true, url: "https://example.test", guideFileCount: 0, email: `person${index + 1}@example.test`, phone: "0541 111 22 33", role: config.page === "customers" ? "CUSTOMER" : "AGENT", departments: [], skills: [], extraPhones: [], extraEmails: [] }));
    await page.route("**/socket.io/**", route => route.abort());
    await page.route("**/api/v1/**", route => {
      const url = new URL(route.request().url());
      const endpoint = url.pathname.replace("/api/v1", "");
      if (endpoint === "/auth/refresh") return route.fulfill({ json: { success: true, data: { accessToken: "test", user: { id: "admin", name: "Admin", role: "ADMIN" } } } });
      const current = Number(url.searchParams.get("page") || 1);
      const limit = Number(url.searchParams.get("limit") || 15);
      if (endpoint === config.endpoint) {
        requests.push(url);
        const filtered = records.filter(record => record.name.includes(url.searchParams.get("search") || ""));
        return route.fulfill({ json: { success: true, data: filtered.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) } } });
      }
      return route.fulfill({ json: { success: true, data: [], unreadCount: 0, pagination: { page: current, limit, total: 0, totalPages: 0 } } });
    });
    await page.goto(`/admin/${config.page}`);
    const tableRows = page.locator(".management-table tbody tr");
    const pagination = page.getByRole("navigation", { name: "Sayfalama", exact: true });
    const picker = page.locator(".management-list-toolbar").getByRole("button", { name: "Kayıt sayısı", exact: true });
    await expect(tableRows).toHaveCount(15);
    await expect(pagination.getByRole("button", { name: "Kayıt sayısı", exact: true })).toHaveCount(0);
    const pickerBox = await picker.boundingBox();
    const tableBox = await page.locator(".management-table").boundingBox();
    expect(pickerBox!.y + pickerBox!.height).toBeLessThanOrEqual(tableBox!.y);
    for (const limit of [10, 20, 50, 15]) {
      await picker.click();
      for (const option of [10, 15, 20, 50]) await expect(page.getByRole("option", { name: String(option), exact: true })).toBeVisible();
      await page.getByRole("option", { name: String(limit), exact: true }).click();
      await expect(tableRows).toHaveCount(limit);
      await expect(pagination).toContainText("Sayfa 1 /");
      expect(requests.some(url => url.searchParams.get("limit") === String(limit))).toBe(true);
      await pagination.getByRole("button", { name: "Sonraki", exact: true }).click();
      const expected = Math.min(limit, 63 + config.leading - limit);
      await expect(tableRows).toHaveCount(expected);
      await expect(tableRows.first()).toContainText(`Kayıt ${String(limit - config.leading + 1).padStart(2, "0")}`);
    }
    await page.locator(".management-panel").first().locator('input[type="search"]').fill("Kayıt 01");
    await expect(tableRows).toHaveCount(1 + config.leading);
    await expect(pagination).toContainText("Sayfa 1 / 1");
    await expect(pagination.getByRole("button", { name: "Önceki", exact: true })).toBeDisabled();
    await expect(pagination.getByRole("button", { name: "Sonraki", exact: true })).toBeDisabled();
    await expect(picker).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `.local/pagination-${config.page}-mobile.png`, fullPage: true });
  });
}
