import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/config/db.js";
import { createCreditOrder } from "../src/services/credit-orders.service.js";
import { storeQuote } from "../src/services/credit-store.service.js";
test("real database serializes concurrent order replays and preserves original price without granting credit", async () => {
  const id = randomUUID(),
    key = randomUUID(),
    planId = randomUUID();
  const actor = {
    id,
    role: "CUSTOMER" as const,
    name: "Credit Order Fixture",
    email: "",
    departmentIds: [],
    sessionId: "",
  };
  let price = "2.50";
  const config = {
    enabled: true,
    currency: "TRY",
    unitPrice: { toString: () => price },
    minCredits: 1,
    maxCredits: 1000,
    validityDays: 365,
    alertsEnabled: false,
    lowCreditPercent: 20,
    expiryNoticeDays: 7,
  };
  const original = db.$transaction;
  const wrap = (tx: any) =>
    new Proxy(tx, {
      get(target, prop) {
        return prop === "creditSalesSettings"
          ? { findUnique: async () => config }
          : Reflect.get(target, prop);
      },
    });
  try {
    await db.user.create({
      data: {
        id,
        name: actor.name,
        email: id + "@example.invalid",
        role: "CUSTOMER",
        passwordHash: "fixture",
        isActive: true,
      },
    });
    const selection = { credits: 10 },
      quote = await storeQuote(actor, selection, wrap(db));
    db.$transaction = ((fn: any, options: any) =>
      original.call(db, (tx: any) => fn(wrap(tx)), options)) as any;
    const input = { selection, quoteKey: quote.quoteKey, requestKey: key };
    const [first, second] = await Promise.all([
      createCreditOrder(actor, input),
      createCreditOrder(actor, input),
    ]);
    assert.equal(first.id, second.id);
    assert.equal(Number(first.total), 25);
    assert.equal(await db.creditOrder.count({ where: { customerId: id } }), 1);
    assert.equal(
      await db.notification.count({
        where: { userId: id, type: "CREDIT_ORDER_CREATED" },
      }),
      1,
    );
    assert.equal(await db.agreement.count({ where: { customerId: id } }), 0);
    price = "3.00";
    assert.equal(Number((await createCreditOrder(actor, input)).total), 25);
    await assert.rejects(
      createCreditOrder(actor, { ...input, requestKey: randomUUID() }),
      { code: "QUOTE_CHANGED" },
    );

    await db.creditSalesPlan.create({
      data: {
        id: planId,
        name: "Fixture " + planId,
        description: "",
        periodMonths: null,
        periodDays: 90,
        periodName: "90-day fixture",
        renewalRequested: true,
        price: "100",
        credits: 900,
        active: true,
      },
    });
    await assert.rejects(storeQuote(actor, { planId, renewalRequested: true }, wrap(db)), { code: 'RENEWAL_DISABLED' });
    const planSelection = { planId };
    const planQuote = await storeQuote(actor, planSelection, wrap(db));
    const planInput = {
      requestKey: randomUUID(),
      selection: planSelection,
      quoteKey: planQuote.quoteKey,
    };
    const planOrder = await createCreditOrder(actor, planInput);
    assert.equal(planOrder.validityDays, 90);
    assert.equal(planOrder.periodMonths, null);
    assert.equal(planOrder.renewalRequested, false);
    assert.ok(planOrder.subscriptionId);
    assert.equal(planOrder.periodName, "90-day fixture");
    await db.creditSalesPlan.update({
      where: { id: planId },
      data: { periodDays: null, periodMonths: 3, renewalRequested: false },
    });
    const planReplay = await createCreditOrder(actor, planInput);
    assert.equal(planReplay.validityDays, 90);
    assert.equal(planReplay.periodMonths, null);
    assert.equal(planReplay.renewalRequested, false);
    assert.equal(await db.agreement.count({ where: { customerId: id } }), 0);
  } finally {
    db.$transaction = original;
    await db.activityLog.deleteMany({
      where: { userId: id, entityType: "CreditOrder" },
    });
    await db.notification.deleteMany({ where: { userId: id } });
    await db.creditOrder.deleteMany({ where: { customerId: id } });
    await db.creditSubscription.deleteMany({ where: { customerId: id } });
    await db.user.deleteMany({ where: { id } });
    await db.creditSalesPlan.deleteMany({ where: { id: planId } });
    await db.$disconnect();
  }
});
