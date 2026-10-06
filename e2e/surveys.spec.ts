import { test, expect, type Page } from "@playwright/test";

const questions = [
  { id: "join", type: "SINGLE", text: "Katılacak mısınız?", options: ["Evet", "Hayır"] },
  { id: "food", type: "MULTIPLE", text: "Ne yemek istersiniz?", options: ["Adana", "Balık"], condition: { questionId: "join", option: "Evet" } },
  { id: "detail", type: "TEXT", text: "Balık tercihinizi açıklayın", condition: { questionId: "food", option: "Balık" } },
  { id: "note", type: "TEXT", text: "Son notunuz nedir?" },
];

async function mockSurveys(page: Page, anonymous = false) {
  const survey = { id: "survey-test", title: "Yemek anketi", description: "Tercihlerinizi belirtin", anonymous, endsAt: "2099-01-01T00:00:00Z", questions, authorName: "Admin", active: true, answered: false, participantCount: 1, recipientCount: 8, responses: [{ respondentName: "Deniz Yılmaz", answers: { join: "Evet", food: ["Balık"], detail: "Izgara olsun\nSalata da olsun", note: "Yemek saati biraz erken olabilir." } }] };
  const requests: { created?: { questions: typeof questions }; submitted?: { answers: Record<string, unknown> } } = {};
  await page.route("**/socket.io/**", route => route.abort());
  await page.route("**/api/v1/**", route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const method = route.request().method();
    if (path === "/auth/refresh") return route.fulfill({ json: { success: true, data: { accessToken: "test-token", user: { id: "survey-admin", name: "Admin", role: "ADMIN" } } } });
    if (path === "/surveys/directory") return route.fulfill({ json: { success: true, data: { people: [{ id: "staff-one", name: "Deniz Yılmaz", departmentIds: ["department-one"] }], departments: [{ id: "department-one", name: "Müşteri Destek ve Operasyon Departmanı" }], smsEnabled: false, emailEnabled: false } } });
    if (path === "/surveys" && method === "POST") {
      requests.created = route.request().postDataJSON();
      return route.fulfill({ json: { success: true, data: { id: "created-survey" } } });
    }
    if (path.endsWith("/responses") && method === "POST") {
      requests.submitted = route.request().postDataJSON(); survey.answered = true;
      return route.fulfill({ json: { success: true, data: { submitted: true } } });
    }
    if (path === "/surveys") return route.fulfill({ json: { success: true, data: [survey] } });
    return route.fulfill({ json: { success: true, data: [], pagination: { page: 1, total: 0, totalPages: 1 } } });
  });
  return requests;
}

test("survey editor saves a prior-option condition and keeps it attached when that option is renamed", async ({ page }) => {
  const requests = await mockSurveys(page);
  await page.goto("/admin/surveys");
  await page.getByRole("button", { name: "Anket oluştur", exact: true }).click();
  await page.getByRole("textbox", { name: "Anket Başlığı *", exact: true }).fill("Koşullu etkinlik anketi");
  const department = page.getByRole("button", { name: "Hedef departman", exact: true });
  const people = page.getByRole("button", { name: "Gönderilecek kişileri seçin", exact: true });
  const departmentBox = (await department.boundingBox())!;
  const peopleBox = (await people.boundingBox())!;
  expect(Math.abs(departmentBox.width - peopleBox.width)).toBeLessThan(1);
  const titleBox = (await page.locator(".survey-basics > .survey-floating-field").first().boundingBox())!;
  const audienceBox = (await page.locator(".survey-audience-controls").boundingBox())!;
  expect(Math.abs(audienceBox.x + audienceBox.width - titleBox.x - titleBox.width)).toBeLessThan(1);
  const first = page.locator(".survey-question-editor").nth(0);
  await first.getByRole("textbox", { name: "Soru metni *", exact: true }).fill("Gelecek misiniz?");
  await first.getByRole("textbox", { name: "Seçenek A *", exact: true }).fill("Evet");
  await first.getByRole("textbox", { name: "Seçenek B *", exact: true }).fill("Hayır");
  await page.getByRole("button", { name: "Soru ekle", exact: true }).click();
  const second = page.locator(".survey-question-editor").nth(1);
  await second.getByRole("button", { name: "Soru 2 türü", exact: true }).click();
  await page.getByRole("option", { name: "Yazılı Cevap", exact: true }).click();
  await second.getByRole("textbox", { name: "Soru metni *", exact: true }).fill("Neden gelemiyorsunuz?");
  await second.getByRole("button", { name: "Soru 2 gösterim koşulu", exact: true }).click();
  await page.getByRole("option", { name: /Soru 1: Gelecek misiniz/ }).click();
  await second.getByRole("button", { name: "Soru 2 koşul seçeneği", exact: true }).click();
  await page.getByRole("option", { name: "Hayır", exact: true }).click();
  await first.getByRole("textbox", { name: "Seçenek B *", exact: true }).fill("Katılmıyorum");
  await expect(second.getByRole("button", { name: "Soru 2 koşul seçeneği", exact: true })).toContainText("Katılmıyorum");
  await page.screenshot({ path: ".local/survey-conditions.png", fullPage: true });
  await page.getByRole("button", { name: "Anketi yayınla", exact: true }).click();
  await expect.poll(() => requests.created).toBeDefined();
  expect(requests.created!.questions[1].condition).toEqual({ questionId: requests.created!.questions[0].id, option: "Katılmıyorum" });
});

test("nonmatching answers skip the whole dependent branch", async ({ page }) => {
  const requests = await mockSurveys(page);
  await page.goto("/admin/surveys");
  await page.getByRole("button", { name: "Oy kullan", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Yemek anketi", exact: true });
  await modal.getByRole("button", { name: "Hayır", exact: false }).click();
  await modal.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(modal.getByRole("heading", { name: "Son notunuz nedir?" })).toBeVisible();
  await expect(modal.getByRole("heading", { name: "Ne yemek istersiniz?" })).toHaveCount(0);
  await modal.getByRole("textbox", { name: "Son notunuz nedir?" }).fill("Gelemiyorum");
  await modal.getByRole("button", { name: "Gönder", exact: true }).click();
  await expect.poll(() => requests.submitted).toBeDefined();
  expect(requests.submitted!.answers).toEqual({ join: "Hayır", note: "Gelemiyorum" });
});

test("multiple choices reveal a branch and changing them discards the now-hidden written draft", async ({ page }) => {
  const requests = await mockSurveys(page);
  await page.goto("/admin/surveys");
  await page.getByRole("button", { name: "Oy kullan", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Yemek anketi", exact: true });
  await modal.getByRole("button", { name: "Evet", exact: false }).click();
  await modal.getByRole("button", { name: "Sonraki", exact: true }).click();
  await modal.getByRole("button", { name: "Balık", exact: false }).click();
  await modal.getByRole("button", { name: "Sonraki", exact: true }).click();
  await modal.getByRole("textbox", { name: "Balık tercihinizi açıklayın" }).fill("Izgara olsun");
  await modal.getByRole("button", { name: "Geri", exact: true }).click();
  await modal.getByRole("button", { name: "Balık", exact: false }).click();
  await modal.getByRole("button", { name: "Adana", exact: false }).click();
  await modal.getByRole("button", { name: "Sonraki", exact: true }).click();
  await expect(modal.getByRole("heading", { name: "Son notunuz nedir?" })).toBeVisible();
  await modal.getByRole("textbox", { name: "Son notunuz nedir?" }).fill("Teşekkürler");
  await modal.getByRole("button", { name: "Gönder", exact: true }).click();
  await expect.poll(() => requests.submitted).toBeDefined();
  expect(requests.submitted!.answers).toEqual({ join: "Evet", food: ["Adana"], note: "Teşekkürler" });
});

test("statistics show written responses and remain scrollable with no visible scrollbar", async ({ page }) => {
  await mockSurveys(page);
  await page.goto("/admin/surveys");
  await page.getByRole("button", { name: "İstatistikler", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "İstatistikler: Yemek anketi" });
  await expect(modal.getByText("Izgara olsun\nSalata da olsun", { exact: true })).toBeVisible();
  await expect(modal.getByText("Yemek saati biraz erken olabilir.", { exact: true })).toBeVisible();
  await expect(modal.getByText("Deniz Yılmaz", { exact: true }).first()).toBeVisible();
  expect(await modal.evaluate(element => getComputedStyle(element).scrollbarWidth)).toBe("none");
  await page.setViewportSize({ width: 900, height: 600 });
  await modal.hover();
  await page.mouse.wheel(0, 500);
  await expect.poll(() => modal.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: ".local/survey-written-statistics.png", fullPage: true });
});

test("anonymous written responses do not show the participant name", async ({ page }) => {
  await mockSurveys(page, true);
  await page.addInitScript(() => localStorage.setItem("helpdesk-theme", "dark"));
  await page.goto("/admin/surveys");
  await page.getByRole("button", { name: "İstatistikler", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "İstatistikler: Yemek anketi" });
  await expect(modal.getByText("Deniz Yılmaz", { exact: true })).toHaveCount(0);
  await expect(modal.getByText("Anonim katılımcı", { exact: true }).first()).toBeVisible();
  await expect(modal.getByText("Yemek saati biraz erken olabilir.", { exact: true })).toBeVisible();
});
