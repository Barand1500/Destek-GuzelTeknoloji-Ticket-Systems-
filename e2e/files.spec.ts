import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function mockWorkspace(page: Page) {
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/refresh")) return route.fulfill({ json: { success: true, data: { accessToken: "test-token", user: { id: "files-admin", name: "Test Admin", role: "ADMIN" } } } });
    return route.fulfill({ json: { success: true, data: [], pagination: { page: 1, total: 0, totalPages: 1 } } });
  });
}

test("uploaded files preview and download their original bytes after reload and rename", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/admin/files");
  await page.getByText("Raporlar", { exact: true }).click();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  await page.locator('.files-actions input[type="file"]').setInputFiles({ name: "resim.png", mimeType: "image/png", buffer: bytes });
  const card = page.locator(".file-card").filter({ hasText: "resim.png" });
  await expect(card).toBeVisible();
  await card.locator("strong").click();
  const preview = page.getByRole("dialog", { name: "resim.png önizlemesi" });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await preview.getByRole("button", { name: "Önizlemeyi kapat" }).click();
  await card.hover();
  const downloadButton = card.getByRole("button", { name: "resim.png indir" });
  const editButton = card.getByRole("button", { name: "resim.png düzenle" });
  expect((await downloadButton.boundingBox())!.x).toBeLessThan((await editButton.boundingBox())!.x);
  await editButton.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("textbox", { name: "Dosya adı", exact: true }).fill("yeni-ad.png");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await page.reload();
  await page.getByText("Raporlar", { exact: true }).click();
  const renamed = page.locator(".file-card").filter({ hasText: "yeni-ad.png" });
  await renamed.hover();
  const downloaded = page.waitForEvent("download");
  await renamed.getByRole("button", { name: "yeni-ad.png indir" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("yeni-ad.png");
  expect(await readFile((await download.path())!)).toEqual(bytes);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Liste görünümü" }).click();
  await renamed.locator("strong").click();
  await expect(page.getByRole("dialog", { name: "yeni-ad.png önizlemesi" })).toBeVisible();
  await page.getByRole("button", { name: "Önizlemeyi kapat" }).click();
  await renamed.hover();
  await renamed.getByRole("button", { name: "yeni-ad.png sil" }).click();
  await expect(renamed).toHaveCount(0);
  await page.reload();
  await page.getByText("Raporlar", { exact: true }).click();
  await expect(page.getByText("Bu klasör boş")).toBeVisible();
});

test("legacy metadata without file contents explains how to restore the file", async ({ page }) => {
  await mockWorkspace(page);
  await page.addInitScript(() => localStorage.setItem("helpdesk-files", JSON.stringify([{ id: "legacy", name: "eski.txt", type: "file", parent: null, size: 3, createdAt: "2026-10-05T10:00:00Z" }])));
  await page.goto("/admin/files");
  await page.getByText("eski.txt", { exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("dosyayı yeniden yükleyin");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
