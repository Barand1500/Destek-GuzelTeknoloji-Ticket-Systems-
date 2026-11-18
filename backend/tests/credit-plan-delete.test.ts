import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/db.js";
import { deleteSalesPlan } from "../src/services/credit-store.service.js";
const admin = { id: "admin", name: "Admin", email: "", role: "ADMIN" as const, departmentIds: [], sessionId: "" };
test("plan deletion checks permission, reports missing plans and audits without changing purchased snapshots", async () => {
  const original = db.$transaction;
  let exists = true, deleted = 0;
  const logs: any[] = [];
  db.$transaction = (async (fn: any) => fn({
    creditSalesPlan: {
      findUnique: async () => exists ? { id: "plan", name: "Plan", price: { toString: () => "10.00" }, currency: "TRY", credits: 100 } : null,
      delete: async ({ where }: any) => { assert.equal(where.id, "plan"); deleted++; },
    },
    activityLog: { create: async ({ data }: any) => logs.push(data) },
  })) as typeof original;
  try {
    await assert.rejects(deleteSalesPlan({ ...admin, role: "CUSTOMER" }, "plan"), (e: any) => e.code === "FORBIDDEN");
    assert.equal(deleted, 0);
    await deleteSalesPlan(admin, "plan");
    assert.equal(deleted, 1);
    assert.equal(logs[0].action, "credit_sales.plan_deleted");
    exists = false;
    await assert.rejects(deleteSalesPlan(admin, "plan"), (e: any) => e.code === "PLAN_NOT_FOUND");
    assert.equal(deleted, 1);
  } finally { db.$transaction = original; await db.$disconnect(); }
});
