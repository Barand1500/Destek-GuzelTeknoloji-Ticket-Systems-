import { test, expect, type Page } from "@playwright/test";

async function mockSettings(page: Page) {
  let integration: Record<string, unknown> = {
    id: "default", updatedAt: "2026-10-05T10:00:00Z",
    responseFastMinutes: 15, responseNormalMinutes: 60,
    responseFastColor: "#167766", responseNormalColor: "#aa8800", responseLateColor: "#dd3333",
    responseFastFromMinutes: 0, responseFastToMinutes: 15, responseNormalFromMinutes: 16, responseNormalToMinutes: 60, responseLateFromMinutes: 61, responseLateToMinutes: 10080,
    smtpEnabled: true, smtpHost: "smtp.example.test", smtpPort: 587, smtpSecure: false, smtpUser: "sender@example.test", smtpPassword: "test-secret", smtpFromAddress: "sender@example.test", smtpFromName: "Destek",
    imapEnabled: true, imapConnectionName: "Destek Gelen Kutusu", imapHost: "imap.example.test", imapPort: 993, imapSecure: true, imapAuthType: "BASIC", imapUser: "inbox@example.test", imapPassword: "test-secret", imapMailbox: "INBOX", imapPollIntervalSeconds: 60, imapCreateTickets: true, imapCreateReplies: true, imapDepartmentId: "department-test",
    smsEnabled: false, smsApiUser: "", smsApiPassword: "", smsSender: "", smsVirtualNumber: "", smsWebhookSecret: "", smsDepartmentId: null,
    whatsappEnabled: false, whatsappAppId: "", whatsappAppSecret: "", whatsappPhoneNumberId: "", whatsappAccessToken: "", whatsappVerifyToken: "", whatsappDepartmentId: null,
  };
  let notifications = { ticketCreatedSubject: "Talebiniz oluşturuldu (#{number})", ticketCreatedBody: "Merhaba {name},\n\n{subject} başlıklı talebiniz oluşturuldu.", ticketReplySubject: "Talebinize yanıt geldi (#{number})", ticketReplyBody: "Merhaba {name},\n\n{reply}" };
  const writes: Record<string, unknown>[] = [];
  let tests = 0;
  let rejectNextSave = false;
  const empty = { success: true, data: [], pagination: { page: 1, total: 0, totalPages: 1 } };
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === "/auth/refresh") return route.fulfill({ json: { success: true, data: { accessToken: "test-token", user: { id: "integration-admin", name: "Admin", role: "ADMIN" } } } });
    if (path === "/integrations/test") { tests++; return route.fulfill({ json: { success: true, data: { success: true } } }); }
    if (path === "/integrations" && route.request().method() === "PUT") {
      const input = route.request().postDataJSON();
      writes.push(input);
      if (rejectNextSave) { rejectNextSave = false; return route.fulfill({ status: 400, json: { success: false, error: { message: "Ayarlar kaydedilemedi" } } }); }
      const { emailNotifications, ...settings } = input;
      integration = { ...integration, ...settings };
      notifications = emailNotifications;
      return route.fulfill({ json: { success: true, data: integration } });
    }
    if (path === "/integrations") return route.fulfill({ json: { success: true, data: integration } });
    if (path === "/notification-settings") return route.fulfill({ json: { success: true, data: notifications } });
    if (path === "/departments") return route.fulfill({ json: { ...empty, data: [{ id: "department-test", name: "Genel Destek" }] } });
    return route.fulfill({ json: empty });
  });
  return { writes, get tests() { return tests; }, rejectNextSave() { rejectNextSave = true; } };
}

test("SMTP, IMAP and notification drafts survive tab changes and save in one request without testing", async ({ page }) => {
  const requests = await mockSettings(page);
  await page.goto("/admin/integrations/channels");
  await expect(page.getByRole("link", { name: "E-posta Bildirimleri" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "SMTP sunucusu", exact: true }).fill("smtp.changed.test");
  await page.getByRole("textbox", { name: "Talep oluşturma mesajı", exact: true }).fill("Yeni talep: {name} / {subject}");
  await expect(page.getByRole("textbox", { name: "Yanıt mesajı", exact: true })).toBeHidden();
  await expect(page.getByText("Mesaj değişkenleri", { exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Gelen e-posta (IMAP)", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Talep oluşturma mesajı", exact: true })).toBeHidden();
  await page.getByRole("textbox", { name: "Yanıt mesajı", exact: true }).fill("Yeni yanıt: {reply}");
  await page.getByRole("textbox", { name: "IMAP sunucusu", exact: true }).fill("imap.changed.test");
  await page.getByRole("textbox", { name: "Klasör", exact: true }).fill("SUPPORT");
  await page.getByRole("button", { name: "Varsayılan departman", exact: true }).click();
  await page.getByRole("option", { name: "İlk aktif departman", exact: true }).click();
  await page.getByRole("tab", { name: "Giden e-posta (SMTP)", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "SMTP sunucusu", exact: true })).toHaveValue("smtp.changed.test");
  await expect(page.getByRole("textbox", { name: "Talep oluşturma mesajı", exact: true })).toHaveValue("Yeni talep: {name} / {subject}");
  await page.screenshot({ path: ".local/integrations-mail.png", fullPage: true });
  await page.getByRole("tab", { name: "Gelen e-posta (IMAP)", exact: true }).click();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Ayarlar ve e-posta metinleri kaydedildi.");
  expect(requests.writes).toHaveLength(1);
  expect(requests.writes[0]).toMatchObject({ smtpHost: "smtp.changed.test", imapHost: "imap.changed.test", imapMailbox: "SUPPORT", imapDepartmentId: null, emailNotifications: { ticketCreatedBody: "Yeni talep: {name} / {subject}", ticketReplyBody: "Yeni yanıt: {reply}" } });
  expect(requests.tests).toBe(0);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "SMTP sunucusu", exact: true })).toHaveValue("smtp.changed.test");
  await page.getByRole("tab", { name: "Gelen e-posta (IMAP)", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Yanıt mesajı", exact: true })).toHaveValue("Yeni yanıt: {reply}");
  await expect(page.getByRole("textbox", { name: "IMAP sunucusu", exact: true })).toHaveValue("imap.changed.test");
});

test("template-only edits and failed saves preserve connection settings and the draft", async ({ page }) => {
  const requests = await mockSettings(page);
  await page.goto("/admin/integrations/notifications");
  await expect(page).toHaveURL("/admin/integrations/channels");
  await page.getByRole("tab", { name: "Gelen e-posta (IMAP)", exact: true }).click();
  await page.getByRole("textbox", { name: "Yanıt mesajı", exact: true }).fill("Taslak yanıt {reply}");
  requests.rejectNextSave();
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByText("Ayarlar kaydedilemedi", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Yanıt mesajı", exact: true })).toHaveValue("Taslak yanıt {reply}");
  await page.getByRole("button", { name: "Kaydet", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(requests.writes[1]).toMatchObject({ smtpHost: "smtp.example.test", imapHost: "imap.example.test", emailNotifications: { ticketReplyBody: "Taslak yanıt {reply}" } });
  expect(requests.tests).toBe(0);
});

test("email layout fits narrow screens and keeps templates visible in dark mode", async ({ page }) => {
  await mockSettings(page);
  await page.addInitScript(() => localStorage.setItem("helpdesk-theme", "dark"));
  await page.goto("/admin/integrations/channels");
  await expect(page.getByRole("textbox", { name: "Talep oluşturma mesajı", exact: true })).toBeVisible();
  await page.screenshot({ path: ".local/integrations-mail-dark.png", fullPage: true });
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(page.getByRole("textbox", { name: "Talep oluşturma mesajı", exact: true })).toBeVisible();
  await page.screenshot({ path: ".local/integrations-mail-mobile.png", fullPage: true });
  const overflow = await page.locator(".integrations-page").evaluate(element => {
    const right = element.getBoundingClientRect().right;
    return [...element.querySelectorAll("*")].filter(child => child.getBoundingClientRect().width > 0 && child.getBoundingClientRect().right > right + 1).map(child => ({ tag: child.tagName, className: child.className, name: child.getAttribute("name"), right: child.getBoundingClientRect().right }));
  });
  expect(overflow).toEqual([]);
});
