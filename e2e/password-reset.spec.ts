import { test, expect } from "@playwright/test";

test("forgot password sends entered email, verifies code and saves a new password", async ({ page }) => {
  const requests: Array<{ path: string; body: any }> = [];
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/refresh")) return route.fulfill({ status: 401, json: { success: false } });
    requests.push({ path, body: route.request().postDataJSON() });
    return route.fulfill({ json: { success: true, data: path.endsWith("/verify-reset-code") ? { resetToken: "test-reset-token" } : { message: "Doğrulama kodu gönderildi." } } });
  });
  await page.goto("/auth");
  await page.getByRole("textbox", { name: "E-posta adresi" }).fill("person@example.com");
  await page.getByRole("button", { name: "Şifremi unuttum?" }).click();
  await expect(page.getByRole("heading", { name: "Şifrenizi yenileyin" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Doğrulama kodu" })).toBeEnabled();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(requests[0].body).toEqual({ email: "person@example.com" });
  await expect(page.getByRole("button", { name: "Kaydet", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Doğrulama kodu" }).fill("123456");
  await page.getByRole("button", { name: "Doğrula", exact: true }).click();
  await page.getByLabel("Yeni şifre", { exact: true }).fill("new-password-123");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Şifreniz yenilendi");
  await expect(page.getByRole("textbox", { name: "E-posta adresi" })).toHaveValue("person@example.com");
  expect(requests.at(-1)?.body).toEqual({ resetToken: "test-reset-token", password: "new-password-123" });
});
