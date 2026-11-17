import test from "node:test";
import assert from "node:assert/strict";
import { cardScheme, formatCardNumber, formatExpiry, validCardNumber, validExpiry, validCvc } from "../../frontend/src/features/credit-store/card-format.js";

test("formats card digits and identifies schemes without claiming a bank", () => {
  assert.equal(formatCardNumber("4111-1111abcd11111111"), "4111 1111 1111 1111");
  assert.equal(formatCardNumber("378282246310005"), "3782 822463 10005");
  assert.equal(cardScheme("22210000"), "Mastercard");
  assert.equal(cardScheme("27200000"), "Mastercard");
  assert.equal(cardScheme("27210000"), null);
  assert.equal(cardScheme("22200000"), null);
  assert.equal(cardScheme("97920000"), "Troy");
  assert.equal(cardScheme("12345678"), null);
  assert.equal(formatExpiry("123456"), "12/34");
});
test("rejects invalid checksums, expired dates, and wrong scheme CVC lengths", () => {
  assert.equal(validCardNumber("4111 1111 1111 1111"), true);
  assert.equal(validCardNumber("4111 1111 1111 1112"), false);
  assert.equal(validCardNumber("0000000000000000"), false);
  const now = new Date(2030, 5, 15);
  assert.equal(validExpiry("06/30", now), true);
  assert.equal(validExpiry("05/30", now), false);
  assert.equal(validExpiry("13/31", now), false);
  assert.equal(validExpiry("01/31", now), true);
  assert.equal(validCvc("1234", "Amex"), true);
  assert.equal(validCvc("123", "Amex"), false);
  assert.equal(validCvc("1234", "Visa"), false);
});
