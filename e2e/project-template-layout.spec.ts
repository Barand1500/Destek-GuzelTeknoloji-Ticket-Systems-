import { test, expect, type Page } from "@playwright/test";

const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");

async function mockWorkspace(page: Page) {
  let templates = Array.from({ length: 7 }, (_, index) => ({ id: `template-${index + 1}`, label: `Şablon ${index + 1}`, title: `Başlık ${index + 1}`, body: `Merhaba {isim}, mesaj ${index + 1}` }));
  let files = [{ id: "guide-one", originalName: "rehber-bir.png", mimeType: "image/png", size: imageBytes.length }, { id: "guide-two", originalName: "rehber-iki.png", mimeType: "image/png", size: imageBytes.length }];
  const requests: { limit?: number; page?: number; upload?: string } = {};
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/v1/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const method = route.request().method();
    const empty = { success: true, data: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 1 } };
    if (path === "/auth/refresh") return route.fulfill({ json: { success: true, data: { accessToken: "test-token", user: { id: "layout-admin", name: "Admin", role: "ADMIN" } } } });
    if (path === "/announcement-templates") {
      const limit = Number(url.searchParams.get("limit"));
      const current = Number(url.searchParams.get("page"));
      requests.limit = limit; requests.page = current;
      const search = url.searchParams.get("search") ?? "";
      const filtered = templates.filter(item => `${item.label} ${item.title} ${item.body}`.includes(search));
      return route.fulfill({ json: { success: true, data: filtered.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total: filtered.length, totalPages: Math.ceil(filtered.length / limit) } } });
    }
    if (path.startsWith("/announcement-templates/") && method === "DELETE") {
      templates = templates.filter(item => item.id !== path.split("/").at(-1));
      return route.fulfill({ json: { success: true, data: null } });
    }
    if (path === "/websites" && method === "POST") return route.fulfill({ json: { success: true, data: { id: "project-test" } } });
    if (path === "/websites") return route.fulfill({ json: { ...empty, data: [{ id: "project-test", name: "Test Proje", url: "https://example.test", isActive: true, guideFileCount: files.length }] } });
    if (path === "/websites/project-test/guide-files" && method === "POST") {
      requests.upload = route.request().postDataBuffer()?.toString("utf8");
      return route.fulfill({ json: { success: true, data: [] } });
    }
    if (path === "/websites/project-test/guide-files") return route.fulfill({ json: { success: true, data: files } });
    if (path.endsWith("/view")) return route.fulfill({ body: imageBytes, contentType: "image/png" });
    if (path.startsWith("/websites/project-test/guide-files/") && method === "DELETE") {
      files = files.filter(item => item.id !== path.split("/").at(-1));
      return route.fulfill({ json: { success: true, data: null } });
    }
    return route.fulfill({ json: empty });
  });
  return requests;
}

test("project upload has a short picker and a separate size hint; enlarged preview keeps file actions below", async ({ page }) => {
  const requests = await mockWorkspace(page);
  await page.goto("/admin/websites");
  await expect(page.locator(".project-guide-upload-trigger > .field-label")).toHaveText("Dosya ekle");
  await expect(page.locator("#project-guide-size-hint")).toContainText("Dosya başına en fazla 25 MB yüklenebilir.");
  const picker = (await page.locator(".project-guide-upload-trigger").boundingBox())!;
  await expect(page.locator(".project-guide-upload-trigger")).toHaveCSS("border-top-width", "1px");
  await expect(page.getByLabel("Dosya seçin", { exact: true })).not.toHaveClass(/sr-only/);
  const hint = (await page.locator("#project-guide-size-hint").boundingBox())!;
  expect(hint.y).toBeGreaterThanOrEqual(picker.y + picker.height);
  await page.getByRole("textbox", { name: "Proje adı", exact: true }).fill("Yeni Proje");
  await page.getByRole("textbox", { name: "URL", exact: true }).fill("https://example.test");
  await page.getByLabel("Dosya seçin", { exact: true }).setInputFiles({ name: "yeni-rehber.png", mimeType: "image/png", buffer: imageBytes });
  await expect(page.getByRole("button", { name: "yeni-rehber.png", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect.poll(() => requests.upload).toContain("yeni-rehber.png");
  await page.getByRole("button", { name: "Test Proje rehberini gör" }).click();
  const modal = page.getByRole("dialog", { name: "Test Proje proje belgeleri" });
  await expect(modal.getByRole("img", { name: "rehber-bir.png" })).toBeVisible();
  const modalBox = (await modal.boundingBox())!;
  expect(modalBox.width).toBeGreaterThan(1300);
  expect(modalBox.height).toBeGreaterThan(900);
  const viewer = (await modal.locator(".attachment-preview-content").boundingBox())!;
  const fileName = (await modal.getByRole("button", { name: "rehber-bir.png", exact: true }).boundingBox())!;
  expect(fileName.y).toBeGreaterThanOrEqual(viewer.y + viewer.height);
  const remove = (await modal.getByRole("button", { name: "rehber-bir.png dosyasını sil" }).boundingBox())!;
  expect(remove.y).toBeGreaterThanOrEqual(fileName.y + fileName.height);
  const groups = await modal.locator(".project-guide-modal-files > span").all();
  const firstGroup = (await groups[0].boundingBox())!;
  const lastGroup = (await groups.at(-1)!.boundingBox())!;
  expect(Math.abs((firstGroup.x + lastGroup.x + lastGroup.width) / 2 - modalBox.x - modalBox.width / 2)).toBeLessThan(1);
  await modal.getByRole("button", { name: "rehber-iki.png", exact: true }).click();
  await expect(modal.getByRole("img", { name: "rehber-iki.png" })).toBeVisible();
  await page.screenshot({ path: ".local/project-guide-expanded.png", fullPage: true });
  page.once("dialog", dialog => dialog.accept());
  await modal.getByRole("button", { name: "rehber-iki.png dosyasını sil" }).click();
  await expect(modal.getByRole("button", { name: "rehber-iki.png", exact: true })).toHaveCount(0);
  await expect(modal.getByRole("img", { name: "rehber-bir.png" })).toBeVisible();
});

test("templates paginate in threes, search resets page, and deleting the last item returns to a valid page", async ({ page }) => {
  const requests = await mockWorkspace(page);
  await page.goto("/admin/saved-replies?tab=templates");
  const cards = page.locator(".announcement-template-list article");
  await expect(cards).toHaveCount(3);
  expect(requests.limit).toBe(3);
  await expect(page.getByText("Bütün şablonları düzenleyebilir veya silebilirsiniz.")).toHaveCount(0);
  const body = (await page.getByRole("textbox", { name: "Duyuru içeriği", exact: true }).boundingBox())!;
  const hint = (await page.locator("#announcement-template-name-hint").boundingBox())!;
  expect(hint.y).toBeGreaterThanOrEqual(body.y + body.height);
  await expect(page.locator("#announcement-template-name-hint .field-warning-icon")).toHaveText("!");
  await page.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(cards.first().locator("strong")).toHaveText("Şablon 4");
  await page.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator("strong")).toHaveText("Şablon 7");
  await page.getByRole("button", { name: "Şablon 7 şablonunu sil" }).click();
  await page.getByRole("dialog", { name: "Hazır şablonu sil" }).getByRole("button", { name: "Sil", exact: true }).click();
  await expect(cards).toHaveCount(3);
  await expect(page.getByRole("navigation", { name: "Sayfalama" })).toContainText("Sayfa 2 / 2");
  await page.getByRole("searchbox").fill("Şablon 1");
  await expect(cards).toHaveCount(1);
  expect(requests.page).toBe(1);
  await expect(cards.first().locator("strong")).toHaveText("Şablon 1");
  await page.screenshot({ path: ".local/template-pagination.png", fullPage: true });
});
