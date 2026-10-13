import { test, expect } from "@playwright/test";

test("category hub opens skills content and preserves legacy links", async ({ page }) => {
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith("/auth/refresh")
      ? { accessToken: "token", user: { id: "admin", role: "ADMIN", name: "Admin" } }
      : path.endsWith("/skill-catalog")
        ? { categories: [], levels: [], skills: [] }
        : [];
    return route.fulfill({ json: { success: true, data, pagination: { page: 1, totalPages: 1, total: 0, limit: 15 } } });
  });
  await page.goto("/admin/tags");
  await expect(page.getByRole("heading", { name: "Etiket oluştur" })).toBeVisible();
  await page.getByRole("navigation", { name: "Kategori bölümleri" }).getByRole("link", { name: "Yetenekler", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Yetenek ekle" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Yetenek yönetimi bölümleri" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Etiket oluştur" })).toHaveCount(0);
  await page.getByRole("button", { name: "Seviyeler", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Seviye ekle" })).toBeVisible();
  await page.goto("/admin/skills");
  await expect(page).toHaveURL(/\/admin\/tags\/skills$/);
  await expect(page.getByRole("heading", { name: "Yetenek ekle" })).toBeVisible();
});
