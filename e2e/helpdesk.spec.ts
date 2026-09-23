import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir,unlink } from "node:fs/promises";
import path from 'node:path';
import bcrypt from "bcrypt";
import { db } from "../backend/src/config/db.js";

test("customer → manager assignment → agent reply → resolution, desktop and mobile", async ({
  browser,
  page,
}) => {
  const unique = randomUUID();
  const email = `browser-${unique}@example.test`;
  const password = `Browser-${randomUUID()}`;
  const adminEmail = `browser-admin-${unique}@example.test`;
  const agentEmail = `browser-agent-${unique}@example.test`;
  const agentName = `E2E Agent ${unique.slice(0, 8)}`;
  const [adminUser, agentUser, technicalDepartment] = await Promise.all([
    db.user.create({ data: { name: `E2E Admin ${unique.slice(0, 8)}`, email: adminEmail, role: "ADMIN", passwordHash: await bcrypt.hash(password, 10) } }),
    db.user.create({ data: { name: agentName, email: agentEmail, role: "AGENT", passwordHash: await bcrypt.hash(password, 10) } }),
    db.department.findUnique({ where: { name: "Teknik Destek" } }),
  ]);
  if (!technicalDepartment) throw new Error("Teknik Destek departmanı bulunamadı.");
  await db.departmentAgent.create({ data: { departmentId: technicalDepartment.id, userId: agentUser.id } });
  const adminContext = await browser.newContext();
  const agentContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const agent = await agentContext.newPage();
  const errors: string[] = [];
  for (const tab of [page, admin, agent])
    tab.on("pageerror", (error) => errors.push(error.message));
  async function login(tab: Page, email: string, password: string) {
    await tab.goto("http://localhost:5173/login");
    await tab.getByLabel("E-posta adresi").fill(email);
    await tab.getByLabel("Şifre", { exact: true }).fill(password);
    await tab.getByRole("button", { name: "Giriş yap", exact: true }).click();
    await expect(tab).toHaveURL(/\/(admin\/dashboard|agent\/inbox|customer\/dashboard)$/);
  }
  try {
    await mkdir(".local/screenshots", { recursive: true });
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Tekrar hoş geldiniz" }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/screenshots/login-desktop.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Kayıt olun" }).click();
    await page.getByLabel("Ad soyad").fill("Deniz Yılmaz");
    await page.getByLabel("E-posta adresi").fill(email);
    await page.getByLabel("Şifre", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Hesap oluştur", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Merhaba, Deniz." }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Yeni talep" }).first().click();
    await page
      .getByLabel("Konu", { exact: true })
      .fill("Ödeme sırasında işlem tamamlanamıyor");
    await page
      .getByRole("combobox", { name: "Departman", exact: true })
      .selectOption({ label: "Teknik Destek" });
    await page
      .getByLabel("Açıklama", { exact: true })
      .fill(
        "Kartımla ödeme yaparken hata alıyorum. Yardımcı olabilir misiniz?",
      );
    await page.getByLabel('Dosya ekle',{exact:true}).setInputFiles({name:'odeme-bilgisi.txt',mimeType:'text/plain',buffer:Buffer.from('İşlem referansı: TEST-2026','utf8')});
    await page
      .getByRole("button", { name: "Talep oluştur", exact: true })
      .click();
    await expect(page).toHaveURL(/\/tickets\/[a-f0-9-]+$/);
    const ticketUrl = page.url();
    await expect(page.getByRole('button',{name:/odeme-bilgisi.txt/})).toBeVisible();
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:/odeme-bilgisi.txt/}).click();
    expect((await download).suggestedFilename()).toBe('odeme-bilgisi.txt');
    await expect(
      page.getByText(
        "Kartımla ödeme yaparken hata alıyorum. Yardımcı olabilir misiniz?",
        { exact: true },
      ),
    ).toBeVisible();
    await login(
      admin,
      adminEmail,
      password,
    );
    await admin.goto(ticketUrl.replace('/customer/tickets/', '/admin/conversations/'));
    await admin
      .getByRole("combobox", { name: "Atanan personel", exact: true })
      .selectOption({ label: agentName });
    await expect(
      admin
        .getByRole("combobox", { name: "Atanan personel", exact: true })
        .locator("option:checked"),
    ).toHaveText(agentName);
    await login(
      agent,
      agentEmail,
      password,
    );
    await expect(
      agent.getByRole("link", { name: /Ödeme sırasında işlem tamamlanamıyor/ }),
    ).toBeVisible();
    await agent.screenshot({
      path: ".local/screenshots/inbox-desktop.png",
      fullPage: true,
    });
    await agent
      .getByRole("link", { name: /Ödeme sırasında işlem tamamlanamıyor/ })
      .click();
    await agent
      .getByRole("textbox", { name: "Yanıtınız" })
      .fill(
        "Merhaba Deniz, ödeme bağlantınızı yeniledik. Tekrar deneyebilirsiniz.",
      );
    await agent.getByRole("button", { name: "Gönder", exact: true }).click();
    await expect(
      agent
        .locator("article")
        .getByText(
          "Merhaba Deniz, ödeme bağlantınızı yeniledik. Tekrar deneyebilirsiniz.",
          { exact: true },
        ),
    ).toBeVisible();
    await agent
      .getByRole("button", { name: "Dahili not", exact: true })
      .click();
    await agent
      .getByRole("textbox", { name: "Dahili not", exact: true })
      .fill("Yalnızca ekip: banka bağlantısı kontrol edildi.");
    await agent.getByRole("button", { name: "Gönder", exact: true }).click();
    await expect(
      agent
        .locator("article")
        .getByText("Yalnızca ekip: banka bağlantısı kontrol edildi.", {
          exact: true,
        }),
    ).toBeVisible();
    await agent.screenshot({
      path: ".local/screenshots/conversation-desktop.png",
      fullPage: true,
    });
    // Realtime delivery must work without reloading the customer's page.
    await expect(
      page
        .locator("article")
        .getByText(
          "Merhaba Deniz, ödeme bağlantınızı yeniledik. Tekrar deneyebilirsiniz.",
          { exact: true },
        ),
    ).toBeVisible();
    await expect(
      page.getByText("Yalnızca ekip: banka bağlantısı kontrol edildi.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Dahili not", exact: true }),
    ).toHaveCount(0);
    await agent
      .getByRole("button", { name: "Çözüldü olarak işaretle" })
      .click();
    await expect(
      agent.getByRole("combobox", { name: "Durum", exact: true }),
    ).toHaveValue("RESOLVED");
    // Status updates also arrive through authenticated Socket.IO invalidation.
    await expect(
      page.getByText("Çözüldü", { exact: true }).first(),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: ".local/screenshots/conversation-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "Taleplerim", exact: true }).click();
    await expect(
      page.getByRole("link", { name: /Ödeme sırasında işlem tamamlanamıyor/ }),
    ).toBeVisible();
    await page.screenshot({
      path: ".local/screenshots/inbox-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "Genel bakış" }).click();
    await expect(
      page.getByRole("heading", { name: "Merhaba, Deniz." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Çıkış yap", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login$/);
    expect(errors).toEqual([]);
  } finally {
    await adminContext.close().catch(() => {});
    await agentContext.close().catch(() => {});
    const owner = await db.user.findUnique({ where: { email } });
    if (owner) {
      const tickets = await db.conversation.findMany({
        where: { customerId: owner.id },
        select: { id: true },
      });
      const ids = tickets.map((t) => t.id);
      const attachments=await db.conversationAttachment.findMany({where:{message:{conversationId:{in:ids}}},select:{storageKey:true}});
      await db.activityLog.deleteMany({
        where: { OR: [{ userId: owner.id }, { entityId: { in: ids } }] },
      });
      await db.conversationMessage.deleteMany({ where: { conversationId: { in: ids } } });
      await db.conversation.deleteMany({ where: { id: { in: ids } } });
      await db.user.delete({ where: { id: owner.id } });
      const uploadDir=path.resolve('backend',process.env.UPLOAD_DIR??'uploads');
      for(const file of attachments){if(/^[a-f0-9-]{36}$/.test(file.storageKey))await unlink(path.join(uploadDir,file.storageKey)).catch(()=>{});}
    }
    const staffIds = [adminUser.id, agentUser.id];
    await db.activityLog.deleteMany({ where: { userId: { in: staffIds } } });
    await db.departmentAgent.deleteMany({ where: { userId: { in: staffIds } } });
    await db.user.deleteMany({ where: { id: { in: staffIds } } });
    await db.$disconnect();
  }
});
