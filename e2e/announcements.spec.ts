import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcrypt";
import { db } from "../backend/src/config/db.js";
import { uploadRoot } from "../backend/src/services/uploads.service.js";
const defaultTemplateLabels = [
  "Toplantı hatırlatma",
  "Genel bilgilendirme",
  "Acil duyuru",
  "Görev atama",
  "Maaş bildirimi",
  "İzin onayı",
  "İzin reddi",
  "Doğum günü kutlama",
];

test("duyuru modalı: şablon, departman, alıcı, dosya, bildirim ve erişim sınırları", async ({
  page,
  request,
}) => {
  const suffix = randomUUID();
  const password = `Test-${suffix}`;
  const passwordHash = await bcrypt.hash(password, 12);
  const userIds: string[] = [],
    departmentIds: string[] = [];
  const templateIds: string[] = [];
  const templateLabel = `Test şablonu ${suffix}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function person(
    name: string,
    role: "ADMIN" | "SUPERVISOR" | "AGENT",
    departmentId?: string,
  ) {
    const email = `ann-${userIds.length}-${suffix}@example.test`;
    const user = await db.user.create({
      data: {
        name,
        role,
        email,
        loginEmail: email,
        passwordHash,
        ...(departmentId ? { departments: { create: { departmentId } } } : {}),
      },
    });
    userIds.push(user.id);
    const response = await request.post("/api/v1/auth/login", {
      data: { email, password },
    });
    expect(response.ok()).toBeTruthy();
    const token = (await response.json()).data.accessToken as string;
    return { ...user, token };
  }
  async function post(actor: { token: string }, payload: unknown) {
    return request.post("/api/v1/announcements", {
      headers: { Authorization: `Bearer ${actor.token}` },
      multipart: { payload: JSON.stringify(payload) },
    });
  }
  try {
    const department = await db.department.create({
      data: { name: `Duyuru Test ${suffix}` },
    });
    const otherDepartment = await db.department.create({
      data: { name: `Diğer Test ${suffix}` },
    });
    departmentIds.push(department.id, otherDepartment.id);
    const admin = await person("Duyuru Admin", "ADMIN");
    const supervisor = await person(
      "Duyuru Sorumlu",
      "SUPERVISOR",
      department.id,
    );
    const recipient = await person("Duyuru Alıcı", "AGENT", department.id);
    const outsider = await person("Duyuru Diğer", "AGENT", otherDepartment.id);
    await page.goto("/auth");
    await page.getByLabel("E-posta adresi").fill(admin.email!);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await page.goto("/admin/saved-replies");
    await expect(
      page.getByRole("tab", { name: "Hazır yanıtlar", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await page
      .getByRole("tab", { name: "Hazır şablonlar", exact: true })
      .click();
    await page.getByLabel("Şablon adı", { exact: true }).fill(templateLabel);
    await page
      .getByLabel("Duyuru başlığı", { exact: true })
      .fill("Yeni bakım duyurusu");
    await page
      .getByLabel("Duyuru içeriği", { exact: true })
      .fill("Merhaba {isim}, bakım yapılacaktır.");
    const templateCreated = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/announcement-templates") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Şablon ekle", exact: true })
      .click();
    const templateResponse = await templateCreated;
    expect(templateResponse.status()).toBe(201);
    templateIds.push((await templateResponse.json()).data.id);
    await page.reload();
    await expect(page.getByText(templateLabel, { exact: true })).toBeVisible();
    await expect(page.getByLabel("Öncelik", { exact: false })).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Toplantı hatırlatma şablonunu düzenle",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Toplantı hatırlatma şablonunu sil",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Toplantı hatırlatma şablonunu düzenle",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Şablon adı", { exact: true })).toHaveValue(
      "Toplantı hatırlatma",
    );
    await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /şablonunu (yukarı|aşağı) taşı/ }),
    ).toHaveCount(0);
    expect(
      await page
        .getByLabel("Duyuru içeriği", { exact: true })
        .evaluate((node) => getComputedStyle(node).resize),
    ).toBe("none");
    expect(
      (
        await request.post("/api/v1/announcement-templates", {
          headers: { Authorization: `Bearer ${recipient.token}` },
          data: {
            label: "Yetkisiz",
            title: "Yetkisiz",
            body: "Yetkisiz",
          },
        })
      ).status(),
    ).toBe(403);
    const trigger = page.getByRole("button", {
      name: "Duyurular",
      exact: true,
    });
    const theme = page.getByRole("button", {
      name: /Gece moduna geç|Gündüz moduna geç/,
    });
    expect((await trigger.boundingBox())!.x).toBeLessThan(
      (await theme.boundingBox())!.x,
    );
    await trigger.click();
    const modal = page.getByRole("dialog", { name: "Duyurular", exact: true });
    await expect(modal).toBeVisible();
    await expect(
      modal.getByRole("button", { name: templateLabel, exact: true }),
    ).toBeVisible();
    expect(
      (
        await modal.locator(".announcement-templates button").allTextContents()
      ).slice(0, 8),
    ).toEqual(defaultTemplateLabels);
    await modal
      .getByRole("button", { name: templateLabel, exact: true })
      .click();
    await expect(modal.getByLabel("Başlık", { exact: false })).toHaveValue(
      "Yeni bakım duyurusu",
    );
    await expect(modal.getByLabel("İçerik", { exact: false })).toHaveValue(
      "Merhaba {isim}, bakım yapılacaktır.",
    );
    await expect(modal.getByLabel("Öncelik", { exact: false })).toHaveValue(
      "NORMAL",
    );
    expect(
      await modal
        .locator("textarea")
        .evaluate((node) => getComputedStyle(node).resize),
    ).toBe("none");
    const channelsSection = modal.locator(".announcement-channels");
    await channelsSection.scrollIntoViewIfNeeded();
    const beforeHover = await channelsSection.boundingBox();
    await channelsSection.locator("label").first().hover();
    expect((await channelsSection.boundingBox())?.y).toBe(beforeHover?.y);
    await modal
      .getByLabel("Hedef departman", { exact: false })
      .selectOption(department.id);
    await expect(
      modal.getByRole("button", { name: "Departmandaki herkes (2)" }),
    ).toBeVisible();
    await modal
      .getByRole("button", { name: "Toplantı hatırlatma", exact: true })
      .click();
    await expect(modal.getByLabel("Başlık", { exact: false })).toHaveValue(
      "Toplantı hatırlatması",
    );
    await modal.getByRole("button", { name: "Seçili kişiler (0)" }).click();
    await modal.getByLabel("Alıcı ara").fill("Duyuru Alıcı");
    await modal.getByRole("checkbox", { name: /Duyuru Alıcı/ }).check();
    await modal.getByLabel("Başlık", { exact: false }).fill("Test duyurusu");
    await modal
      .getByLabel("İçerik", { exact: false })
      .fill(
        "Merhaba {isim}, " +
          "Bu metin bildirim önizlemesinden daha uzundur. ".repeat(10),
      );
    await modal.getByLabel("Duyuruya dosya ekle").setInputFiles({
      name: "duyuru.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Duyuru test belgesi", "utf8"),
    });
    await expect(modal.getByText("duyuru.txt", { exact: true })).toBeVisible();
    await mkdir(".local/screenshots", { recursive: true });
    await modal.locator(".announcements-scroll").evaluate((node) => {
      node.scrollTop = 0;
    });
    await page.screenshot({
      path: ".local/screenshots/announcements-light.png",
    });
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/announcements") &&
        response.request().method() === "POST",
    );
    await modal
      .getByRole("button", { name: "Duyuruyu yayınla", exact: true })
      .click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const announcement = (await response.json()).data;
    await expect(
      modal.getByText("Duyuru kaydedildi.", { exact: false }),
    ).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await db.announcementDelivery.findFirst({
              where: { announcementId: announcement.id },
            })
          )?.status,
      )
      .toBe("SENT");
    const notifications = await db.notification.findMany({
      where: { userId: { in: userIds }, type: "ANNOUNCEMENT" },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].userId).toBe(recipient.id);
    expect(notifications[0].message).toContain("Merhaba Duyuru Alıcı");
    await expect(modal.getByText("1/1 gönderildi")).toBeVisible();
    const recipientFiles = await request.get(
      `/api/v1/announcements/${announcement.id}/files/0`,
      { headers: { Authorization: `Bearer ${recipient.token}` } },
    );
    expect(await recipientFiles.text()).toBe("Duyuru test belgesi");
    expect(
      (
        await request.get(`/api/v1/announcements/${announcement.id}/files/0`, {
          headers: { Authorization: `Bearer ${outsider.token}` },
        })
      ).status(),
    ).toBe(404);
    const payload = {
      title: "Test",
      body: "Duyuru metni",
      priority: "NORMAL",
      departmentId: otherDepartment.id,
      recipientMode: "ALL",
      recipientIds: [],
      channels: ["NOTIFICATION"],
      eventAt: null,
      pinned: false,
    };
    expect((await post(supervisor, payload)).status()).toBe(403);
    expect(
      (
        await post(recipient, { ...payload, departmentId: department.id })
      ).status(),
    ).toBe(403);
    expect(
      (
        await post(admin, {
          ...payload,
          departmentId: department.id,
          recipientMode: "SELECTED",
          recipientIds: [outsider.id],
        })
      ).status(),
    ).toBe(403);
    expect((await post(admin, { ...payload, channels: [] })).status()).toBe(
      400,
    );
    expect(
      (
        await request.post("/api/v1/announcements", {
          headers: { Authorization: `Bearer ${admin.token}` },
          multipart: { payload: "{" },
        })
      ).status(),
    ).toBe(400);
    const outsiderHistory = await request.get("/api/v1/announcements", {
      headers: { Authorization: `Bearer ${outsider.token}` },
    });
    expect(
      (await outsiderHistory.json()).data.some(
        (item: { id: string }) => item.id === announcement.id,
      ),
    ).toBeFalsy();
    await modal.getByRole("button", { name: "Duyuruları kapat" }).click();
    await page
      .getByRole("button", {
        name: `${templateLabel} şablonunu düzenle`,
        exact: true,
      })
      .click();
    await page
      .getByLabel("Duyuru başlığı", { exact: true })
      .fill("Güncel bakım duyurusu");
    await page
      .getByRole("button", { name: "Değişiklikleri kaydet", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await db.announcementTemplate.findUnique({
              where: { id: templateIds[0] },
            })
          )?.title,
      )
      .toBe("Güncel bakım duyurusu");
    await page
      .getByRole("button", {
        name: `${templateLabel} şablonunu sil`,
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog", { name: "Hazır şablonu sil" })
      .getByRole("button", { name: "Sil", exact: true })
      .click();
    await expect(
      page
        .getByRole("tabpanel", { name: "Hazır şablonlar" })
        .getByText(templateLabel, { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Hazır şablonu sil" }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Gece moduna geç" }).click();
    await trigger.click();
    await expect(modal).toBeVisible();
    await expect(
      modal.getByRole("button", { name: templateLabel, exact: true }),
    ).not.toBeVisible();
    expect(
      (
        await modal.locator(".announcement-templates button").allTextContents()
      ).slice(0, 8),
    ).toEqual(defaultTemplateLabels);
    await page.screenshot({
      path: ".local/screenshots/announcements-dark.png",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".local/screenshots/announcements-mobile.png",
    });
    expect(
      await modal.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBeTruthy();
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    const stored = await db.announcement.findMany({
      where: { authorId: { in: userIds } },
      select: { id: true, files: true },
    });
    await db.announcement.deleteMany({
      where: { id: { in: stored.map((item) => item.id) } },
    });
    for (const item of stored)
      for (const file of item.files as Array<{ storageKey: string }>)
        await unlink(path.join(uploadRoot, file.storageKey)).catch(() => {});
    await page.close();
    await db.announcementTemplate.deleteMany({
      where: { id: { in: templateIds } },
    });
    await db.activityLog.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.department.deleteMany({ where: { id: { in: departmentIds } } });
  }
});
