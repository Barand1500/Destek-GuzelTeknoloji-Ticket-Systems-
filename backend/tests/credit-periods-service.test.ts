import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/db.js";
import {
  createCreditPeriod,
  listCreditPeriods,
  archiveCreditPeriod,
} from "../src/services/credit-periods.service.js";
import { salesPlanInput } from "../src/services/credit-store-pricing.js";
import {
  saveSalesPlan,
  storeQuote,
} from "../src/services/credit-store.service.js";
const admin = {
  id: "staff",
  name: "Staff",
  email: "",
  role: "ADMIN" as const,
  departmentIds: [],
  sessionId: "",
};
const customer = { ...admin, id: "owner", role: "CUSTOMER" as const };
test("period catalogs require exact permissions, bound rows, audit and preserve duration snapshots", async (t) => {
  const originals = {
    tx: db.$transaction,
    find: db.creditSalesPeriod.findMany,
  };
  t.after(() => {
    db.$transaction = originals.tx;
    db.creditSalesPeriod.findMany = originals.find;
  });
  let row: any = null,
    audits = 0,
    count = 0,
    plan: any = null,
    locked = false;
  const tx: any = {
    creditSalesSettings: {
      upsert: async () => {},
      findUnique: async () => ({
        enabled: true,
        unitPrice: { toString: () => "1.00" },
        currency: "TRY",
        minCredits: 1,
        maxCredits: 1000,
        validityDays: 365,
      }),
    },
    $queryRaw: async () => {
      locked = true;
      return [];
    },
    creditSalesPeriod: {
      findUnique: async () => row,
      count: async () => count,
      create: async ({ data }: any) => {
        assert.equal(locked, true);
        return (row = { id: "template", ...data });
      },
      update: async ({ data }: any) => (row = { ...row, ...data }),
      updateMany: async () => {
        row.archivedAt = new Date();
        return { count: 1 };
      },
    },
    activityLog: {
      create: async () => {
        audits++;
      },
    },
    creditSalesPlan: {
      count: async () => 0,
      create: async ({ data }: any) =>
        (plan = { id: "plan", ...data, price: { toString: () => data.price } }),
      findUnique: async () => plan,
      update: async ({ data }: any) =>
        (plan = { ...plan, ...data, price: { toString: () => data.price } }),
    },
    user: {
      findFirst: async () => ({
        id: "owner",
        name: "Company",
        parentCustomerId: null,
      }),
    },
  };
  db.$transaction = (async (fn: any) => fn(tx)) as any;
  db.creditSalesPeriod.findMany = (async (input: any) => {
    assert.equal(input.take, 100);
    assert.equal(input.where.archivedAt, null);
    return [row];
  }) as any;
  await assert.rejects(createCreditPeriod(customer, {}), { code: "FORBIDDEN" });
  await assert.rejects(listCreditPeriods(customer), { code: "FORBIDDEN" });
  await assert.rejects(archiveCreditPeriod(customer, "template"), {
    code: "FORBIDDEN",
  });
  const template = await createCreditPeriod(admin, {
    name: "Özel 3 gün",
    startsOn: "2028-02-28",
    endsOn: "2028-03-01",
  });
  assert.equal(template.value, 3);
  await assert.rejects(
    createCreditPeriod(admin, { name: template.name, unit: "DAY", value: 3 }),
    { code: "PERIOD_EXISTS" },
  );
  await listCreditPeriods(admin);
  const input = salesPlanInput.parse({
    name: "Özel",
    periodDays: 3,
    periodName: template.name,
    price: "50",
    credits: 100,
    active: true,
    renewalRequested: true,
  });
  await saveSalesPlan(admin, null, input);
  const first = await storeQuote(customer, { planId: "plan" }, tx);
  assert.equal(first.validityDays, 3);
  assert.equal(first.periodMonths, null);
  assert.equal(first.renewalRequested, true);
  const once = await storeQuote(
    customer,
    { planId: "plan", renewalRequested: false },
    tx,
  );
  assert.notEqual(once.quoteKey, first.quoteKey);
  await archiveCreditPeriod(admin, "template");
  assert.equal(
    (await storeQuote(customer, { planId: "plan" }, tx)).quoteKey,
    first.quoteKey,
  );
  await saveSalesPlan(
    admin,
    "plan",
    salesPlanInput.parse({
      ...input,
      periodMonths: 3,
      periodDays: null,
      renewalRequested: false,
    }),
  );
  assert.equal(plan.periodDays, null);
  assert.equal(plan.periodMonths, 3);
  assert.notEqual(
    (await storeQuote(customer, { planId: "plan" }, tx)).quoteKey,
    first.quoteKey,
  );
  row = null;
  count = 100;
  await assert.rejects(
    createCreditPeriod(admin, { name: "101", unit: "MONTH", value: 1 }),
    { code: "PERIOD_LIMIT" },
  );
  assert.equal(audits, 4);
});
