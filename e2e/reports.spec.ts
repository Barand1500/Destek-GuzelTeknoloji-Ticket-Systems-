import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("settings reports: tabs, filtered metrics, CSV download and responsive themes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const employees = [
    {
      id: "ece",
      name: "Ece Kaya",
      email: "ece@example.test",
      departmentIds: ["operations"],
      assigned: 1,
      resolved: 1,
      statuses: { RESOLVED: 1 },
      firstResponseMinutes: 5,
    },
    {
      id: "deniz",
      name: "Deniz Yılmaz",
      email: "deniz@example.test",
      departmentIds: ["operations"],
      assigned: 1,
      resolved: 0,
      statuses: { IN_PROGRESS: 1 },
      firstResponseMinutes: 12,
    },
    {
      id: "baran",
      name: "Baran Ürüncan",
      email: null,
      departmentIds: [],
      assigned: 0,
      resolved: 0,
      statuses: {},
      firstResponseMinutes: null,
    },
  ];
  const requests: URL[] = [];
  let extraEmployees = 0;
  const creditRequests: URL[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    if (path === "/auth/refresh")
      return route.fulfill({
        json: {
          success: true,
          data: {
            accessToken: "test",
            user: { id: "admin", role: "ADMIN", name: "Test Admin" },
          },
        },
      });
    if (path === '/reports/credit-usage') {
      creditRequests.push(url);
      const actorId=url.searchParams.get('agentId')||'ece';
      return route.fulfill({json:{success:true,totalCredits:42,staff:[{id:actorId,name:'Ece Kaya',credits:42,count:2}],pagination:{page:Number(url.searchParams.get('page')||1),total:22,totalPages:Math.ceil(22/Number(url.searchParams.get('limit')||20)),limit:Number(url.searchParams.get('limit')||20)},data:[42,0].map((credits,index)=>({id:'charge-'+index,credits,createdAt:'2026-11-16T09:00:00Z',actor:{id:actorId,name:'Ece Kaya'},agreement:credits?{name:'Şirket Destek Paketi'}:null,conversation:{id:'ticket-'+index,number:719+index,subject:'Kredilendirilen destek '+index,customer:{name:'Örnek Müşteri'},department:{name:'Operasyon'}}}))}});
    }
    if (path === "/reports") {
      requests.push(url);
      const personal = url.searchParams.get("agentId");
      const departmental = url.searchParams.get("departmentId");
      const days = Number(url.searchParams.get("days") ?? 30);
      const counts =
        personal === "ece"
          ? { RESOLVED: 1 }
          : departmental
            ? { RESOLVED: 1, IN_PROGRESS: 1 }
            : { RESOLVED: 1, IN_PROGRESS: 1, PENDING: 1 };
      const total = personal ? 1 : departmental ? 2 : 3;
      const data = {
        total,
        statuses: counts,
        priorities: { NORMAL: total },
        period: { from: "2026-09-06T00:00:00Z", to: "2026-10-05T12:00:00Z" },
        daily: Array.from({ length: days }, (_, index) => ({
          date: new Date(Date.UTC(2026, 9, 5 - days + 1 + index))
            .toISOString()
            .slice(0, 10),
          created: index % 4,
          resolved: index % 3,
        })),
        firstResponseMinutes: 5,
        resolutionMinutes: 120,
        staff: [...employees, ...Array.from({ length: extraEmployees }, (_, index) => ({ ...employees[2], id: `extra-${index}`, name: `Yeni çalışan ${index + 1}` }))],
        departments: [
          {
            id: "operations",
            name: "Operasyon",
            count: personal ? 1 : 2,
            statuses: personal
              ? { RESOLVED: 1 }
              : { RESOLVED: 1, IN_PROGRESS: 1 },
            employees: employees.slice(0, 2),
          },
        ],
      };
      return route.fulfill({ json: { success: true, data } });
    }
    return route.fulfill({
      json: {
        success: true,
        data: [],
        unreadCount: 0,
        pagination: { page: 1, total: 0, totalPages: 0, limit: 25 },
      },
    });
  });
  await page.goto("/admin/reports");
  await expect(
    page.getByRole("heading", { name: "Raporlar & İstatistikler" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Çalışan Sıralaması" }),
  ).toBeVisible();
  const creditTable=page.getByRole('table',{name:'Personel Kredi Kullanımları',exact:true});
  await expect(creditTable).toBeVisible();
  await expect(creditTable).toContainText('Ece Kaya');
  await expect(creditTable).toContainText('42');
  await expect(creditTable.locator('.report-credit-amount').last()).toHaveText('0');
  await expect(creditTable.getByRole('link').first()).toHaveAttribute('href','/admin/conversations/ticket-0');
  const creditPanel=page.locator('.report-credit-usage');
  await expect(creditPanel.locator('.report-credit-staff')).toHaveCount(0);
  await expect(creditPanel.locator('.report-credit-totals')).toContainText('42 kredi');
  await expect(creditPanel.locator('.report-credit-totals')).toContainText('22 talep');
  await creditPanel.getByRole('button',{name:'Sonraki',exact:true}).click();
  await expect.poll(()=>creditRequests.at(-1)?.searchParams.get('page')).toBe('2');
  await creditPanel.getByRole('textbox',{name:'Personel, Talep veya Müşteri Ara'}).fill('Ece');
  await expect(creditPanel.getByRole('button',{name:'Ara',exact:true})).toHaveCount(0);
  await expect.poll(()=>creditRequests.at(-1)?.searchParams.get('search')).toBe('Ece');
  expect(creditRequests.at(-1)?.searchParams.get('page')).toBe('1');
  await creditPanel.getByRole('button',{name:'Kredi Kullanımı Filtresi',exact:true}).click();
  await page.getByRole('option',{name:'Kredi Harcananlar',exact:true}).click();
  await expect.poll(()=>creditRequests.at(-1)?.searchParams.get('creditType')).toBe('paid');
  await creditPanel.getByRole('button',{name:'Kredi Kayıt Sayısı',exact:true}).click();
  await page.getByRole('option',{name:'50 kayıt',exact:true}).click();
  await expect.poll(()=>creditRequests.at(-1)?.searchParams.get('limit')).toBe('50');
  await creditPanel.getByRole('button',{name:'Temizle',exact:true}).click();
  await expect.poll(()=>creditRequests.at(-1)?.searchParams.get('creditType')).toBe('all');
  expect(creditRequests.at(-1)?.searchParams.get('search')).toBeNull();

  await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Raporlar", exact: true }),
  ).toHaveAttribute("href", "/admin/reports");
  await page.screenshot({
    path: ".local/reports-general-light.png",
    fullPage: true,
  });
  await expect(page.getByRole("heading", { name: "Durum Dağılımı", exact: true })).toHaveCount(0);
  const departmentPanel = page.locator(".report-performance-stack > .report-panel").first();
  const responsePanel = page.locator(".report-performance-stack > .report-panel").last();
  await expect(responsePanel).toContainText("Yanıt ve Çözüm Süreleri");
  const departmentBox = (await departmentPanel.boundingBox())!;
  const responseBox = (await responsePanel.boundingBox())!;
  expect(responseBox.y).toBeGreaterThanOrEqual(departmentBox.y + departmentBox.height);
  expect(Math.abs(responseBox.x - departmentBox.x)).toBeLessThan(1);
  const rankingPanel = page.locator(".report-general-performance > .report-panel");
  const stack = (await page.locator(".report-performance-stack").boundingBox())!;
  const rankingBefore = (await rankingPanel.boundingBox())!;
  expect(Math.abs(rankingBefore.height - stack.height)).toBeLessThan(1);
  extraEmployees = 18;
  await page.getByRole("button", { name: "Trend ve Süre Dönemi", exact: true }).click();
  await page.getByRole("option", { name: "Son 7 Gün", exact: true }).click();
  await expect(page.locator(".report-ranking .report-employee")).toHaveCount(21);
  expect(Math.abs((await rankingPanel.boundingBox())!.height - rankingBefore.height)).toBeLessThan(1);
  expect(await page.locator(".report-ranking").evaluate(node => {
    node.scrollTop = node.scrollHeight;
    return node.scrollTop > 0;
  })).toBe(true);
  await page.screenshot({ path: ".local/reports-ranking-scroll.png", fullPage: true });
  await page.getByRole("tab", { name: "Kişi Raporu" }).click();
  await expect(
    page.getByText("Rapor görmek için bir çalışan seçin"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rapor İndir" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Çalışan Seçin", exact: true }).click();
  await page.getByRole("option", { name: "Ece Kaya", exact: true }).click();
  await expect(page.locator(".report-stat").first()).toContainText("1");
  await expect(page.locator(".report-stat").last()).toContainText("%100");
  expect(
    requests.some((url) => url.searchParams.get("agentId") === "ece"),
  ).toBe(true);
  await expect.poll(()=>creditRequests.some(url=>url.searchParams.get('agentId')==='ece'&&url.searchParams.get('days')==='7')).toBe(true);
  await expect(creditPanel.locator('.report-credit-totals')).toContainText('42 kredi');
  await expect(creditPanel.locator('.report-credit-staff')).toHaveCount(0);
  await page.getByRole('tab',{name:'Genel Rapor',exact:true}).click();
  await creditPanel.getByRole('button',{name:'Ece Kaya kişi raporunu aç',exact:true}).first().click();
  await expect(page.getByRole('tab',{name:'Kişi Raporu',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.getByRole('button',{name:'Çalışan Seçin',exact:true})).toContainText('Ece Kaya');
  await expect(creditPanel.locator('.report-credit-totals')).toContainText('42 kredi');
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Rapor İndir" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^rapor-person.*\.csv$/);
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("Ece Kaya");
  expect(csv).toContain('"Toplam";"1"');
  await page.screenshot({
    path: ".local/reports-person-light.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Departman Raporu" }).click();
  await expect(page.locator(".report-department-card")).toContainText(
    "2 çalışan · 2 talep",
  );
  await expect(page.locator(".report-department-rate")).toContainText("%50");
  await page.getByRole("button", { name: "Departman Seçin", exact: true }).click();
  await page.getByRole("option", { name: "Operasyon", exact: true }).click();
  await expect(page.getByRole("button", { name: "Rapor İndir" })).toBeEnabled();
  expect(
    requests.some(
      (url) => url.searchParams.get("departmentId") === "operations",
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Trend ve Süre Dönemi", exact: true }).click();
  await page.getByRole("option", { name: "Son 7 Gün", exact: true }).click();
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.searchParams.get("days") === "7" &&
          url.searchParams.get("departmentId") === "operations",
      ),
    )
    .toBe(true);
  await expect.poll(()=>creditRequests.some(url=>url.searchParams.get('departmentId')==='operations'&&url.searchParams.get('days')==='7')).toBe(true);
  await page.getByRole("button", { name: "Gece Moduna Geç" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: ".local/reports-department-dark.png",
    fullPage: true,
  });
  await page.locator('.report-credit-usage').screenshot({path:'.local/staff-credit-report-dark.png'});
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["Genel Rapor", "Kişi Raporu", "Departman Raporu"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: ".local/reports-mobile-dark.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
