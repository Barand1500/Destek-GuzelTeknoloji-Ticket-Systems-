import { test, expect, type Page } from "@playwright/test";

const admin = { id: "session-admin", name: "Test Yönetici", role: "ADMIN", email: "admin@example.test" };
const customer = { id: "session-customer", name: "Test Müşteri", role: "CUSTOMER", email: "caller@example.test", phone: "05551234567" };
const department = { id: "session-department", name: "Genel Destek", isActive: true };
const staff = { id: "session-staff", name: "Destek Personeli", presence: "OFFLINE", openConversationCount: 2 };
const conversation = { id: "session-conversation", number: 101, subject: "Taslak talep", channel: "TICKET", status: "OPEN", priority: "NORMAL", customer, customerId: customer.id, assignedAgent: staff, assignedAgentId: staff.id, createdBy: admin, department, tags: [], createdAt: "2026-10-05T10:00:00Z" };
const empty = { success: true, data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 1 } };
const secondConversation = { ...conversation, id: "second-conversation", number: 102, subject: "İkinci talep" };

async function mockWorkspace(page: Page) {
  let creates = 0;
  let replies = 0;
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    if (path === "/auth/refresh") return route.fulfill({ json: { success: true, data: { accessToken: "session-token", user: admin } } });
    if (path === "/customers" && method === "POST") return route.fulfill({ json: { success: true, data: customer } });
    if (path === "/conversations" && method === "POST") {
      creates++;
      return route.fulfill({ json: { success: true, data: conversation } });
    }
    if (path === `/conversations/${conversation.id}/messages` && method === "POST") {
      replies++;
      return route.fulfill({ json: { success: true, data: { id: "sent-message" } } });
    }
    if (path === `/conversations/${conversation.id}`) return route.fulfill({ json: { success: true, data: conversation } });
    if (path === `/conversations/${secondConversation.id}`) return route.fulfill({ json: { success: true, data: secondConversation } });
    if (path === "/conversations") return route.fulfill({ json: { ...empty, data: [conversation, secondConversation] } });
    if (path === `/customers/${customer.id}`) return route.fulfill({ json: { success: true, data: customer } });
    if (path === "/customers") return route.fulfill({ json: { ...empty, data: [customer] } });
    if (path === "/departments") return route.fulfill({ json: { ...empty, data: [department] } });
    if (path === `/departments/${department.id}/agents`) return route.fulfill({ json: { ...empty, data: [staff] } });
    if (path === "/staff-presence") return route.fulfill({ json: { success: true, data: { staff: [] } } });
    return route.fulfill({ json: empty });
  });
  return { get creates() { return creates; }, get replies() { return replies; } };
}

test("caller form and assignment survive navigating away and returning", async ({ page }) => {
  const requests = await mockWorkspace(page);
  await page.goto("/admin/phone-support");
  await page.getByRole("button", { name: "Yeni kişi ekle" }).click();
  const form = page.locator(".phone-support-create-v2");
  await form.getByRole("textbox", { name: "Ad soyad" }).fill("Yeni Müşteri");
  await form.getByRole("textbox", { name: "Telefon", exact: true }).fill("05551234567");
  await form.getByRole("textbox", { name: "E-posta", exact: true }).fill("draft@example.test");
  await form.getByRole("textbox", { name: "Şirket" }).fill("Taslak Şirket");
  await form.getByRole("textbox", { name: "Müşteri notu" }).fill("Geri aranacak");
  await form.getByRole("textbox", { name: "Konu" }).fill("Taslak talep");
  await form.getByRole("textbox", { name: "Açıklama", exact: true }).fill("Ekranda hata var, inceleyiniz.");
  await form.getByRole("button", { name: "Departman", exact: true }).click();
  await page.getByRole("option", { name: department.name, exact: true }).click();
  await form.getByRole("button", { name: "Atanan personeli seçin" }).click();
  await page.getByRole("option", { name: /Destek Personeli/ }).click();
  await page.getByRole("link", { name: "Dosyalar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dosya Paylaşımı" })).toBeVisible();
  await page.getByRole("link", { name: "Talep aç", exact: true }).click();
  await expect(form.getByRole("textbox", { name: "Ad soyad" })).toHaveValue("YENİ MÜŞTERİ");
  await expect(form.getByRole("textbox", { name: "Telefon", exact: true })).toHaveValue("0555 123 45 67");
  await expect(form.getByRole("textbox", { name: "E-posta", exact: true })).toHaveValue("draft@example.test");
  await expect(form.getByRole("textbox", { name: "Şirket" })).toHaveValue("Taslak Şirket");
  await expect(form.getByRole("textbox", { name: "Müşteri notu" })).toHaveValue("Geri aranacak");
  await expect(form.getByRole("textbox", { name: "Konu" })).toHaveValue("Taslak talep");
  await expect(form.getByRole("textbox", { name: "Açıklama", exact: true })).toHaveValue("Ekranda hata var, inceleyiniz.");
  await expect(form.getByRole("button", { name: "Atanan personeli seçin" })).toContainText(staff.name);
  await expect(page.getByRole("main")).toHaveCount(1);
  expect(requests.creates).toBe(0);
});

test("different conversations retain independent reply drafts", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto(`/admin/conversations/${conversation.id}`);
  await page.getByRole("textbox", { name: "Yanıtınız" }).fill("Birinci talebin taslağı");
  await page.getByRole("link", { name: "Gelen kutusuna dön", exact: true }).click();
  await page.getByRole("link", { name: /İkinci talep/ }).click();
  await expect(page.getByRole("textbox", { name: "Yanıtınız" })).toHaveValue("");
  await page.getByRole("textbox", { name: "Yanıtınız" }).fill("İkinci talebin taslağı");
  await page.getByRole("link", { name: "Gelen kutusuna dön", exact: true }).click();
  await page.getByRole("link", { name: /Taslak talep/ }).click();
  await expect(page.getByRole("textbox", { name: "Yanıtınız" })).toHaveValue("Birinci talebin taslağı");
  await page.getByRole("link", { name: "Gelen kutusuna dön", exact: true }).click();
  await page.getByRole("link", { name: /İkinci talep/ }).click();
  await expect(page.getByRole("textbox", { name: "Yanıtınız" })).toHaveValue("İkinci talebin taslağı");
});

test("selected customer remains selected after navigation", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto(`/admin/phone-support?customerId=${customer.id}`);
  const form = page.locator(".phone-support-request-form");
  await form.getByRole("textbox", { name: "Konu" }).fill("Mevcut müşterinin taslağı");
  await form.getByRole("textbox", { name: "Açıklama", exact: true }).fill("Seçilen kişi korunmalı.");
  await page.getByRole("link", { name: "Personeller", exact: true }).click();
  await page.getByRole("link", { name: "Talep aç", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`customerId=${customer.id}`));
  await expect(form.getByRole("textbox", { name: "Seçilen kişi" })).toHaveValue(customer.name);
  await expect(form.getByRole("textbox", { name: "Konu" })).toHaveValue("Mevcut müşterinin taslağı");
  await expect(form.getByRole("textbox", { name: "Açıklama", exact: true })).toHaveValue("Seçilen kişi korunmalı.");
});

test("Talep aç resumes the conversation and preserves reply files; new request starts clean", async ({ page }) => {
  const requests = await mockWorkspace(page);
  await page.goto(`/admin/phone-support?customerId=${customer.id}`);
  const form = page.locator(".phone-support-request-form");
  await form.getByRole("textbox", { name: "Konu" }).fill(conversation.subject);
  await form.getByRole("textbox", { name: "Açıklama", exact: true }).fill("Talep açıklaması");
  await form.getByRole("button", { name: "Departman", exact: true }).click();
  await page.getByRole("option", { name: department.name, exact: true }).click();
  await form.getByRole("button", { name: "Talebi oluştur ve gönder" }).click();
  await expect(page).toHaveURL(`/admin/conversations/${conversation.id}`);
  await page.getByRole("textbox", { name: "Yanıtınız" }).fill("Gönderilmemiş yanıt");
  await page.getByLabel("Dosya ekle", { exact: true }).setInputFiles({ name: "taslak.txt", mimeType: "text/plain", buffer: Buffer.from("taslak ek") });
  await page.getByRole("link", { name: "Dosyalar", exact: true }).click();
  await page.getByRole("link", { name: "Talep aç", exact: true }).click();
  await expect(page).toHaveURL(`/admin/conversations/${conversation.id}`);
  await expect(page.getByRole("textbox", { name: "Yanıtınız" })).toHaveValue("Gönderilmemiş yanıt");
  await expect(page.getByRole("button", { name: "taslak.txt", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dahili not", exact: true }).click();
  await page.getByRole("link", { name: "Personeller", exact: true }).click();
  await page.getByRole("link", { name: "Talep aç", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Dahili not", exact: true })).toHaveValue("Gönderilmemiş yanıt");
  expect(requests.creates).toBe(1);
  expect(requests.replies).toBe(0);
  await page.getByRole("link", { name: "Yeni talep", exact: true }).click();
  await expect(page).toHaveURL("/admin/phone-support");
  await page.getByRole("button", { name: "Yeni kişi ekle" }).click();
  await expect(page.locator(".phone-support-create-v2").getByRole("textbox", { name: "Ad soyad" })).toHaveValue("");
  await expect(page.locator(".phone-support-create-v2").getByRole("textbox", { name: "Konu" })).toHaveValue("");
  await expect(page.getByRole("main")).toHaveCount(1);
});
