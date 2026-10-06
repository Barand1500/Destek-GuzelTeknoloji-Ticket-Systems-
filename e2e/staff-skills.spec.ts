import { test, expect } from "@playwright/test";

const department = { id: "dept-skills", name: "Yazılım" };
const secondDepartment = { id: "dept-support", name: "Genel Destek" };
const person = {
  id: "person-skills",
  name: "React Uzmanı",
  role: "AGENT",
  email: "react@example.test",
  isActive: true,
  departments: [{ departmentId: department.id, department }],
  skills: [],
};
const matches = [
  { name: "React", category: "Frontend", level: "EXPERT" },
  { name: "İngilizce", category: "Diller", level: "ADVANCED" },
  { name: "Almanca", category: "Diller", level: "INTERMEDIATE" },
];
const empty = {
  success: true,
  data: [],
  pagination: { page: 1, totalPages: 1, total: 0, limit: 100 },
};

test("personnel form saves multiple languages, custom skills and independent levels", async ({
  page,
}) => {
  let saved: Record<string, unknown> | undefined;
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === "/auth/refresh")
      return route.fulfill({
        json: {
          success: true,
          data: {
            accessToken: "token",
            user: { id: "admin", role: "ADMIN", name: "Admin" },
          },
        },
      });
    if (
      path === `/users/${person.id}` &&
      route.request().method() === "PATCH"
    ) {
      saved = route.request().postDataJSON();
      return route.fulfill({
        json: { success: true, data: { ...person, ...saved } },
      });
    }
    if (path === "/users")
      return route.fulfill({ json: { ...empty, data: [person] } });
    if (path === "/departments")
      return route.fulfill({
        json: { ...empty, data: [{ ...department, isActive: true }, { ...secondDepartment, isActive: true }] },
      });
    return route.fulfill({ json: empty });
  });
  await page.goto("/admin/users");
  await page
    .getByRole("button", { name: /düzenle/i })
    .first()
    .click();
  const memberships = page.getByRole("button", { name: "Departman üyelikleri", exact: true });
  await memberships.click();
  await expect(page.getByRole("option", { name: /Yazılım$/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: /Yazılım$/ }).click();
  await page.getByRole("option", { name: secondDepartment.name, exact: true }).click();
  await memberships.click();
  await page
    .getByRole("button", { name: "Yetenek seviyesi", exact: true })
    .click();
  await page.getByRole("option", { name: "Uzman", exact: true }).click();
  await page.getByRole("button", { name: "React", exact: true }).click();
  await page.getByRole("button", { name: "Yetenek kategorisi" }).click();
  await page.getByRole("option", { name: "Diller", exact: true }).click();
  await page.getByRole("button", { name: "İngilizce", exact: true }).click();
  await page.getByRole("button", { name: "Almanca", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Almanca seviyesi" })
    .selectOption("BEGINNER");
  await page
    .getByRole("textbox", { name: "Özel yetenek veya dil" })
    .fill("İtalyanca");
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  await page.getByRole("button", { name: "İtalyanca kaldır" }).click();
  await page
    .getByRole("textbox", { name: "Özel yetenek veya dil" })
    .fill("Özel ERP");
  await page.getByRole("button", { name: "Ekle", exact: true }).click();
  await page.screenshot({
    path: ".local/staff-skills-desktop.png",
    fullPage: true,
  });
  await page
    .locator("form")
    .filter({ has: page.getByRole("textbox", { name: "Ad soyad" }) })
    .getByRole("button", { name: /Kaydet|Güncelle/ })
    .click();
  await expect
    .poll(() => saved?.skills)
    .toEqual([
      { name: "React", category: "Frontend", level: "EXPERT" },
      { name: "İngilizce", category: "Diller", level: "EXPERT" },
      { name: "Almanca", category: "Diller", level: "BEGINNER" },
      { name: "Özel ERP", category: "Diller", level: "EXPERT" },
    ]);
  expect(saved?.departmentIds).toEqual([secondDepartment.id]);
});

test("description suggestions select department and staff and submit their IDs", async ({
  page,
}) => {
  let searches = 0;
  let submitted: Record<string, unknown> | undefined;
  let releaseAgents!: () => void;
  const agentGate = new Promise<void>((resolve) => {
    releaseAgents = resolve;
  });
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (path === "/auth/refresh")
      return route.fulfill({
        json: {
          success: true,
          data: {
            accessToken: "token",
            user: { id: "admin", role: "ADMIN", name: "Admin" },
          },
        },
      });
    if (path === "/staff-suggestions") {
      searches++;
      return route.fulfill({
        json: {
          success: true,
          data: route.request().postDataJSON().text.includes("React")
            ? [{ ...person, matches, departments: [department] }]
            : [],
        },
      });
    }
    if (path === "/departments")
      return route.fulfill({ json: { ...empty, data: [department] } });
    if (path === `/departments/${department.id}/agents`) {
      await agentGate;
      return route.fulfill({
        json: { ...empty, data: [{ ...person, presence: "OFFLINE", openConversationCount: 7 }] },
      });
    }
    if (path === "/customers" && route.request().method() === "POST")
      return route.fulfill({ json: { success: true, data: { id: "caller" } } });
    if (path === "/conversations" && route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      return route.fulfill({
        status: 400,
        json: {
          success: false,
          error: { message: "Test: yönlendirmeyi durdur" },
        },
      });
    }
    return route.fulfill({ json: empty });
  });
  try {
    await page.goto("/admin/phone-support");
    await page.getByRole("button", { name: "Yeni kişi ekle" }).click();
    const form = page.locator(".phone-support-create-v2");
    await form.getByRole("textbox", { name: "Ad soyad" }).fill("Test Müşteri");
    await form
      .getByRole("textbox", { name: "Telefon", exact: true })
      .fill("05551234567");
    await form
      .getByRole("textbox", { name: "Konu", exact: true })
      .fill("React destek talebi");
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const description = form.getByRole("textbox", {
      name: "Açıklama",
      exact: true,
    });
    await description.fill("React");
    await page.clock.runFor(500);
    expect(searches).toBe(0);
    await form
      .getByRole("textbox", { name: "Açıklama", exact: true })
      .fill("React hatası var; İngilizce ve Almanca destek gerekiyor");
    await page.clock.runFor(999);
    expect(searches).toBe(0);
    await page.clock.runFor(1);
    const suggestion = form.locator(".staff-suggestion-list button");
    await expect(suggestion.locator(".staff-suggestion-skill")).toContainText([
      /React\s*· Uzman/,
      /İngilizce\s*· İleri/,
      /Almanca\s*· Orta/,
    ]);
    expect(searches).toBe(1);
    await expect(form.getByText("Uygun personeller aranıyor…")).toHaveCount(0);
    await expect(description).toHaveCSS("resize", "none");
    const descriptionHeight = await description.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    await form.getByRole("textbox", { name: "Konu", exact: true }).focus();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
    });
    await page.clock.runFor(35_000);
    expect(searches).toBe(1);
    expect(
      await description.evaluate(
        (element) => element.getBoundingClientRect().height,
      ),
    ).toBe(descriptionHeight);
    await expect(
      form.getByRole("button", { name: "Departman", exact: true }),
    ).toHaveText("Seçin");
    await suggestion.click();
    await expect(
      form.getByRole("button", { name: "Departman", exact: true }),
    ).toHaveText("Yazılım");
    await expect(
      form.getByRole("button", { name: "Atanan personeli seçin" }),
    ).toContainText("React Uzmanı");
    await page.screenshot({
      path: ".local/staff-suggestions-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: ".local/staff-suggestions-mobile.png",
      fullPage: true,
    });
    await page.clock.resume();
    releaseAgents();
    const assignee = form.getByRole("button", {
      name: "Atanan personeli seçin",
    });
    await expect(assignee).toContainText("Çevrim dışı");
    await expect(assignee).toContainText("7 açık talep");
    await assignee.click();
    await expect(page.getByRole("option", { name: /React Uzmanı/ })).toContainText("7 açık talep");
    await page.screenshot({ path: ".local/assignee-workload-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: ".local/assignee-workload-desktop.png", fullPage: true });
    await assignee.click();
    const status = assignee.locator(".presence-option-status");
    const labelBounds = await assignee.locator(":scope > span").boundingBox();
    const statusBounds = await status.boundingBox();
    expect(
      Math.abs(
        labelBounds!.x +
          labelBounds!.width -
          (statusBounds!.x + statusBounds!.width),
      ),
    ).toBeLessThan(2);
    await form
      .getByRole("button", { name: "Kişiyi ve talebi oluştur" })
      .click();
    await expect.poll(() => submitted?.assignedAgentId).toBe(person.id);
    expect(submitted?.departmentId).toBe(department.id);
    await form
      .getByRole("textbox", { name: "Açıklama", exact: true })
      .fill("Başka bir sorun");
    await expect(suggestion).toHaveCount(0);
  } finally {
    releaseAgents();
  }
});
