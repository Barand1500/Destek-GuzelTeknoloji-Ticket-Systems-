import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/db.js";
import {
  storeCatalog,
  storeQuote,
  salesAdminCatalog,
  saveSalesSettings,
  saveSalesPlan,
} from "../src/services/credit-store.service.js";
const actor = {
  id: "person",
  name: "Test",
  email: "",
  role: "CUSTOMER" as const,
  departmentIds: [],
  sessionId: "",
};
const admin = { ...actor, role: "ADMIN" as const };
test("catalog/quotes enforce active customer/company, permissions and current server prices", async (t) => {
  let linked = false;
  let active = true,
    enabled = true,
    planActive = true;
  const originals = {
    user: db.user.findFirst,
    settings: db.creditSalesSettings.findUnique,
    plan: db.creditSalesPlan.findUnique,
    plans: db.creditSalesPlan.findMany,
  };
  t.after(() => {
    db.user.findFirst = originals.user;
    db.creditSalesSettings.findUnique = originals.settings;
    db.creditSalesPlan.findUnique = originals.plan;
    db.creditSalesPlan.findMany = originals.plans;
  });
  db.user.findFirst = (async ({ where }: any) =>
    active
      ? {
          id: where.id,
          name: where.id,
          company: "Company",
          parentCustomerId: linked ? "company" : null,
        }
      : null) as any;
  db.creditSalesSettings.findUnique = (async () => ({
    enabled,
    unitPrice: { toString: () => "2.50" },
    minCredits: 1,
    maxCredits: 100,
    validityDays: 365,
    currency: "USD",
  })) as any;
  db.creditSalesPlan.findMany = (async () => []) as any;
  db.creditSalesPlan.findUnique = (async () =>
    planActive
      ? {
          id: "plan",
          name: "Aylık",
          currency: "EUR",
          active: true,
          credits: 50,
          periodMonths: 1,
          price: { toString: () => "90.00" },
        }
      : null) as any;
  await assert.rejects(salesAdminCatalog(actor), { code: "FORBIDDEN" });
  await assert.rejects(storeCatalog(admin), { code: "FORBIDDEN" });
  const quote = await storeQuote(actor, { credits: 10 });
  assert.equal(quote.total, "25.00");
  assert.equal(quote.currency, "USD");
  assert.equal(quote.owner.id, "person");
  linked = true;
  await assert.rejects(storeCatalog(actor), { code: "PURCHASE_OWNER_ONLY" });
  await assert.rejects(storeQuote(actor, { credits: 10 }), {
    code: "PURCHASE_OWNER_ONLY",
  });
  linked = false;
  assert.equal(quote.paymentAvailable, false);
  assert.equal((await storeQuote(actor, { planId: "plan" })).total, "90.00");
  assert.equal((await storeQuote(actor, { planId: "plan" })).currency, "EUR");
  planActive = false;
  await assert.rejects(storeQuote(actor, { planId: "plan" }));
  enabled = false;
  await assert.rejects(storeQuote(actor, { credits: 10 }));
  active = false;
  await assert.rejects(storeCatalog(actor));
});
test("catalog writes require update permission and audit without creating credit", async (t) => {
  const original = db.$transaction;
  let audits = 0;
  t.after(() => {
    db.$transaction = original;
  });
  db.$transaction = (async (fn: any) =>
    fn({
      creditSalesSettings: {
        upsert: async ({ create }: any) => ({
          ...create,
          unitPrice: { toString: () => create.unitPrice },
        }),
      },
      creditSalesPlan: {
        count: async () => 0,
        create: async ({ data }: any) => ({
          ...data,
          id: "new-plan",
          price: { toString: () => data.price },
        }),
      },
      activityLog: {
        create: async () => {
          audits++;
        },
      },
    })) as any;
  const input = {
    enabled: true,
    unitPrice: "3.00",
    minCredits: 1,
    maxCredits: 100,
    validityDays: 365,
  };
  await assert.rejects(saveSalesSettings(actor, input), { code: "FORBIDDEN" });
  await saveSalesSettings(admin, input);
  await saveSalesPlan(admin, null, {
    name: "Aylık",
    description: "",
    periodMonths: 1,
    price: "100.00",
    credits: 50,
    active: true,
  });
  assert.equal(audits, 2);
});
