import { test } from "node:test";
import assert from "node:assert/strict";
import {
  moneyMinor,
  creditQuote,
  salesSettingsInput,
  salesPlanInput,
  quoteInput,
} from "../src/services/credit-store-pricing.js";
const settings = { unitPrice: "2.50", minCredits: 10, maxCredits: 1000 };
test("quotes calculate exact money in both directions without losing fractional credits", () => {
  assert.equal(moneyMinor("0.29"), 29);
  assert.deepEqual(creditQuote(settings, { credits: 11 }), {
    credits: 11,
    total: "27.50",
    unitPrice: "2.50",
    currency: "TRY",
  });
  assert.equal(creditQuote(settings, { amount: "27.50" }).credits, 11);
  assert.throws(() => creditQuote(settings, { amount: "26.00" }));
  for (const amount of ["-1", "1e3", "1.001", "NaN", "Infinity"])
    assert.throws(() => moneyMinor(amount));
  for (const credits of [0, -1, 1.5, 9, 1001])
    assert.throws(() => creditQuote(settings, { credits }));
  assert.throws(() =>
    creditQuote({ ...settings, unitPrice: "0" }, { credits: 10 }),
  );
});
test("settings and plans enforce usable ranges, explicit whole-period credits and no extra price fields", () => {
  assert.equal(
    salesSettingsInput.safeParse({
      enabled: true,
      unitPrice: "2.50",
      minCredits: 10,
      maxCredits: 5,
      validityDays: 365,
    }).success,
    false,
  );
  assert.equal(
    salesSettingsInput.safeParse({
      enabled: true,
      unitPrice: "0",
      minCredits: 1,
      maxCredits: 10,
      validityDays: 365,
    }).success,
    false,
  );
  assert.equal(
    salesPlanInput.safeParse({
      name: "Yıllık",
      periodMonths: 12,
      credits: 1000,
      price: "100.00",
      description: "",
      active: true,
    }).success,
    true,
  );
  assert.equal(
    salesPlanInput.safeParse({
      name: "A",
      periodMonths: 0,
      credits: 1,
      price: "1",
      active: true,
    }).success,
    false,
  );
});

test("fractional credit errors suggest valid nearby totals", () => {
  assert.throws(
    () => creditQuote(settings, { amount: "26.00" }),
    /25[.,]00.*27[.,]50/,
  );
});


test('legacy renewal setup requests fail explicitly while one-time plans remain valid', () => {
  const plan = { name: 'Period package', periodMonths: 1, credits: 10, price: '10', active: true };
  assert.equal(salesPlanInput.parse(plan).renewalRequested, false);
  assert.equal(salesPlanInput.parse({ ...plan, renewalRequested: false }).renewalRequested, false);
  assert.throws(() => salesPlanInput.parse({ ...plan, renewalRequested: true }), { code: 'RENEWAL_DISABLED' });
  const planId = 'b64e9a50-1641-4c37-b628-48dad163cb5a';
  assert.throws(() => quoteInput.parse({ planId, renewalRequested: true }), { code: 'RENEWAL_DISABLED' });
  assert.equal(quoteInput.parse({ planId }).planId, planId);
});
