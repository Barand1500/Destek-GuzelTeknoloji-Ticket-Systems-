import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMoneyEntry,
  formatMoneyEntry,
} from "../../frontend/src/features/credit-store/number-format.js";
test("money entry handles Turkish grouping and blocks letters/invalid precision", () => {
  assert.equal(normalizeMoneyEntry("1.400,50"), "1400.50");
  assert.equal(normalizeMoneyEntry("1400ada"), "1400");
  assert.equal(normalizeMoneyEntry("14.50"), "14.50");
  assert.equal(normalizeMoneyEntry("1.400"), "1400");
  assert.equal(normalizeMoneyEntry("-10"), null);
  assert.equal(normalizeMoneyEntry("1.2,34"), null);
  assert.equal(normalizeMoneyEntry("1400,123"), null);
  assert.equal(formatMoneyEntry("1400.5"), "1.400,50");
});

test("credit entry keeps whole credits and Turkish thousands grouping", async () => {
  const { normalizeCreditEntry, formatCreditEntry } =
    await import("../../frontend/src/features/credit-store/number-format.js");
  assert.equal(normalizeCreditEntry("180ü"), "180");
  assert.equal(normalizeCreditEntry("10.000"), "10000");
  assert.equal(normalizeCreditEntry("-10"), null);
  assert.equal(normalizeCreditEntry("1,5"), null);
  assert.equal(normalizeCreditEntry("1.5"), null);
  assert.equal(formatCreditEntry("10000"), "10.000");
  assert.equal(formatCreditEntry(""), "");
});
