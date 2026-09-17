import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { db } from "../backend/src/config/db.js";

test("customer → manager assignment → agent reply → resolution, desktop and mobile", async ({
  browser,
  page,
}) => {
  const unique = randomUUID();
  const email = `browser-${unique}@example.test`;
  const password = `Browser-${randomUUID()}`;
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
    await expect(tab).toHaveURL(/\/tickets$/);
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
      page.getByRole("heading", { name: "Taleplerim" }),
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
    await page
      .getByRole("button", { name: "Talep oluştur", exact: true })
      .click();
    await expect(page).toHaveURL(/\/tickets\/[a-f0-9-]+$/);
    const ticketUrl = page.url();
    await expect(
      page.getByText(
        "Kartımla ödeme yaparken hata alıyorum. Yardımcı olabilir misiniz?",
        { exact: true },
      ),
    ).toBeVisible();
    await login(
      admin,
      process.env.SEED_ADMIN_EMAIL!,
      process.env.SEED_ADMIN_PASSWORD!,
    );
    await admin.goto(ticketUrl);
    await admin
      .getByRole("combobox", { name: "Atanan personel", exact: true })
      .selectOption({ label: "Destek Uzmanı" });
    await expect(
      admin
        .getByRole("combobox", { name: "Atanan personel", exact: true })
        .locator("option:checked"),
    ).toHaveText("Destek Uzmanı");
    await login(
      agent,
      process.env.SEED_AGENT_EMAIL!,
      process.env.SEED_AGENT_PASSWORD!,
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
    await page.reload();
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
    await page.reload();
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
      const tickets = await db.ticket.findMany({
        where: { customerId: owner.id },
        select: { id: true },
      });
      const ids = tickets.map((t) => t.id);
      await db.activityLog.deleteMany({
        where: { OR: [{ userId: owner.id }, { entityId: { in: ids } }] },
      });
      await db.ticketMessage.deleteMany({ where: { ticketId: { in: ids } } });
      await db.ticket.deleteMany({ where: { id: { in: ids } } });
      await db.user.delete({ where: { id: owner.id } });
    }
    await db.$disconnect();
  }
});
