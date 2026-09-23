import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { db } from "../backend/src/config/db.js";

test("management forms persist changes, notifications and reporting render", async ({ page }) => {
  const token = randomUUID().slice(0, 8);
  const email = `management-admin-${token}@example.test`;
  const memberEmail = `management-member-${token}@example.test`;
  const password = `Management-${randomUUID()}`;
  const departmentName = `E2E Department ${token}`;
  const renamedDepartment = `${departmentName} Updated`;
  const tagName = `E2E Tag ${token}`;
  const replyTitle = `E2E Reply ${token}`;
  const admin = await db.user.create({ data: { name: `Manager ${token}`, email, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) } });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await db.notification.createMany({ data: [1, 2].map(value => ({ userId: admin.id, type: "TEST", title: `E2E Notice ${value} ${token}`, message: `Test notification ${token}` })) });
    await page.goto("/login");
    await page.getByLabel("E-posta adresi").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    await page.goto("/departments");
    await page.getByLabel("Departman adı").fill(departmentName);
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await page.getByLabel("Kayıtlarda ara").fill(token);
    let row = page.getByRole("row").filter({ hasText: departmentName });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Düzenle" }).click();
    await page.getByLabel("Departman adı").fill(renamedDepartment);
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    row = page.getByRole("row").filter({ hasText: renamedDepartment });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Arşivle" }).click();
    await expect(row.getByText("Arşiv", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Etkinleştir" }).click();
    await expect(row.getByText("Aktif", { exact: true })).toBeVisible();

    await page.goto("/users");
    await page.getByLabel("Ad soyad", { exact: true }).fill(`E2E Member ${token}`);
    await page.getByLabel("E-posta", { exact: true }).fill(memberEmail);
    await page.getByLabel("İlk şifre").fill(password);
    await page.getByRole("combobox", { name: "Rol", exact: true }).selectOption("AGENT");
    await page.getByLabel(renamedDepartment, { exact: true }).check();
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await page.getByLabel("Ad veya e-posta ile ara").fill(memberEmail);
    const member = page.getByRole("row").filter({ hasText: memberEmail });
    await expect(member).toContainText(renamedDepartment);
    await member.getByRole("button", { name: "Düzenle" }).click();
    await page.getByRole("combobox", { name: "Rol", exact: true }).selectOption("SUPERVISOR");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(member).toContainText("Departman sorumlusu");
    await member.getByRole("button", { name: "Devre dışı bırak" }).click();
    await expect(member.getByText("Devre dışı", { exact: true })).toBeVisible();
    await member.getByRole("button", { name: "Etkinleştir" }).click();
    await expect(member.getByText("Aktif", { exact: true })).toBeVisible();

    await page.goto("/tags");
    await page.getByLabel("Etiket adı").fill(tagName);
    await page.getByLabel("Renk", { exact: true }).fill("#337755");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await page.getByLabel("Kayıtlarda ara").fill(token);
    const tag = page.getByRole("row").filter({ hasText: tagName });
    await expect(tag).toBeVisible();
    await tag.getByRole("button", { name: "Düzenle" }).click();
    await page.getByLabel("Renk", { exact: true }).fill("#775533");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(tag.locator(".management-swatch")).toHaveCSS("background-color", "rgb(119, 85, 51)");
    page.once("dialog", dialog => dialog.accept());
    await tag.getByRole("button", { name: "Sil", exact: true }).click();
    await expect(tag).toHaveCount(0);

    await page.goto("/saved-replies");
    await page.getByLabel("Başlık", { exact: true }).fill(replyTitle);
    await page.getByLabel("Yanıt metni").fill("İlk yanıt metni");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await page.getByLabel("Kayıtlarda ara").fill(token);
    const reply = page.locator("article").filter({ hasText: replyTitle });
    await expect(reply).toBeVisible();
    await reply.getByRole("button", { name: "Düzenle" }).click();
    await page.getByLabel("Yanıt metni").fill("Güncellenen yanıt metni");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(reply).toContainText("Güncellenen yanıt metni");
    page.once("dialog", dialog => dialog.accept());
    await reply.getByRole("button", { name: "Sil", exact: true }).click();
    await expect(reply).toHaveCount(0);

    await page.goto("/profile");
    await expect(page.getByLabel("Ad soyad")).toHaveValue(admin.name);
    await page.getByLabel("Ad soyad").fill(`Updated Manager ${token}`);
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Profiliniz güncellendi.");
    await page.reload();
    await expect(page.getByLabel("Ad soyad")).toHaveValue(`Updated Manager ${token}`);

    await page.goto("/notifications");
    await page.getByLabel("Yalnızca okunmamış bildirimler").check();
    const notice = page.locator("article").filter({ hasText: `E2E Notice 1 ${token}` });
    await expect(notice).toBeVisible();
    await notice.getByRole("button", { name: "Okundu işaretle", exact: true }).click();
    await expect(notice).toHaveCount(0);
    await page.getByRole("button", { name: "Tümünü okundu işaretle", exact: true }).click();
    await expect(page.locator("article")).toHaveCount(0);

    for (const [path, title] of [["/reports", "Raporlar"], ["/activity-logs", "İşlem geçmişi"], ["/settings", "Sistem ayarları"], ["/customers", "Müşteriler"]]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.getByText("Kayıtlar yükleniyor…")).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Ekip performansı" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Kullanıcı oluştur", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    const people = await db.user.findMany({ where: { OR: [{ id: admin.id }, { email: memberEmail }] }, select: { id: true } });
    const ids = people.map(person => person.id);
    await db.activityLog.deleteMany({ where: { userId: { in: ids } } });
    await db.savedReply.deleteMany({ where: { authorId: admin.id } });
    await db.tag.deleteMany({ where: { name: tagName } });
    await db.departmentAgent.deleteMany({ where: { userId: { in: ids } } });
    await db.department.deleteMany({ where: { name: { in: [departmentName, renamedDepartment] } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
