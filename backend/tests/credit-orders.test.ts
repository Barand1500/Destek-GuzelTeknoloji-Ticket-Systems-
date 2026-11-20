import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/config/db.js";
import { storeQuote } from "../src/services/credit-store.service.js";
import {
  createCreditOrder,
  cancelCreditOrder,
  listCreditOrders,
} from "../src/services/credit-orders.service.js";
const actor = {
  id: "owner",
  role: "CUSTOMER" as const,
  name: "Test",
  email: "",
  departmentIds: [],
  sessionId: "",
};
test("orders snapshot current quote, reject stale previews and replay without duplicate notifications", async (t) => {
  let price = "2.50",
    linked = false,
    notifications = 0,
    row: any = null;
  const tx: any = {
    $queryRaw: async () => [{ id: actor.id }],
    user: {
      findFirst: async () => ({
        id: actor.id,
        name: "Owner",
        company: "Company",
        parentCustomerId: linked ? "parent" : null,
      }),
    },
    creditSalesSettings: {
      findUnique: async () => ({
        enabled: true,
        currency: "TRY",
        unitPrice: { toString: () => price },
        minCredits: 1,
        maxCredits: 1000,
        validityDays: 365,
      }),
    },
    creditPaymentAttempt: { count: async () => 0 },
    creditOrder: {
      findUnique: async () => row,
      create: async ({ data }: any) =>
        (row = {
          ...data,
          id: "order",
          number: 1,
          status: "PENDING",
          createdAt: new Date(),
          customer: { id: actor.id, name: "Owner", company: "Company" },
        }),
      updateMany: async () => {
        row.status = "CANCELLED";
        return { count: 1 };
      },
    },
    notification: {
      create: async () => {
        notifications++;
      },
    },
    activityLog: { create: async () => ({}) },
  };
  const original = db.$transaction;
  t.after(() => {
    db.$transaction = original;
  });
  db.$transaction = (async (fn: any) => fn(tx)) as any;
  const selection = { credits: 10 },
    quote = await storeQuote(actor, selection, tx);
  const input = {
    requestKey: "11111111-1111-4111-8111-111111111111",
    selection,
    quoteKey: quote.quoteKey,
  };
  price = "3.00";
  await assert.rejects(createCreditOrder(actor, input), {
    code: "QUOTE_CHANGED",
  });
  assert.equal(row, null);
  price = "2.50";
  const first = await createCreditOrder(actor, input);
  assert.equal(first.total, "25.00");
  assert.equal(notifications, 1);
  price = "5.00";
  const replay = await createCreditOrder(actor, input);
  assert.equal(replay.id, first.id);
  assert.equal(replay.total, "25.00");
  assert.equal(notifications, 1);
  await assert.rejects(
    createCreditOrder(actor, { ...input, selection: { credits: 11 } }),
    { code: "IDEMPOTENCY_CONFLICT" },
  );
  linked = true;
  await assert.rejects(createCreditOrder(actor, input), {
    code: "PURCHASE_OWNER_ONLY",
  });
  linked = false;
  await cancelCreditOrder({ ...actor, role: "ADMIN" }, "order", true);
  assert.equal(row.status, "CANCELLED");
  assert.equal(notifications, 2);
  await cancelCreditOrder({ ...actor, role: "ADMIN" }, "order", true);
  assert.equal(notifications, 2);
});
test("customer lists are scoped and paginated in SQL and linked accounts cannot list", async (t) => {
  const originals = { user: db.user.findFirst, transaction: db.$transaction };
  t.after(() => {
    db.user.findFirst = originals.user;
    db.$transaction = originals.transaction;
  });
  let linked = false;
  db.user.findFirst = (async () => ({
    id: actor.id,
    name: "Owner",
    parentCustomerId: linked ? "parent" : null,
  })) as any;
  db.$transaction = (async (fn: any) =>
    fn({
      creditOrder: {
        count: async ({ where }: any) => {
          assert.equal(where.customerId, actor.id);
          return 51;
        },
        findMany: async ({ where, take, skip }: any) => {
          assert.equal(where.customerId, actor.id);
          assert.equal(take, 20);
          assert.equal(skip, 20);
          return [];
        },
      },
    })) as any;
  const result = await listCreditOrders(actor, { page: 2, limit: 20 });
  assert.equal(result.pagination.totalPages, 3);
  linked = true;
  await assert.rejects(listCreditOrders(actor, { page: 1, limit: 20 }), {
    code: "PURCHASE_OWNER_ONLY",
  });
});

test('cancellation does not expose other accounts or mutate paid orders; staff needs update permission', async t => {
 const original = db.$transaction;
 t.after(() => { db.$transaction = original; });
 let row: any = { id: 'other-order', customerId: 'other', status: 'PENDING', total: '10', unitPrice: null };
 const tx: any = { user: { findFirst: async () => ({ id: actor.id, name: 'Owner', parentCustomerId: null }) }, creditOrder: { findUnique: async () => row } };
 db.$transaction = (async (fn: any) => fn(tx)) as any;
 await assert.rejects(cancelCreditOrder(actor, 'other-order'), { code: 'ORDER_NOT_FOUND' });
 row = { ...row, customerId: actor.id, status: 'PAID' };
 await assert.rejects(cancelCreditOrder(actor, 'other-order'), { code: 'ORDER_NOT_PENDING' });
 const viewer = { ...actor, role: 'AGENT' as const, rolePermissions: ['integrations.view'] };
 await assert.rejects(cancelCreditOrder(viewer, 'other-order', true), { code: 'FORBIDDEN' });
 await assert.rejects(listCreditOrders({ ...viewer, rolePermissions: [] }, { page: 1, limit: 20 }, true), { code: 'FORBIDDEN' });
});
