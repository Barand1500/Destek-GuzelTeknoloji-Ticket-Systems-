import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periodInput,
  periodEndDate,
  durationInput,
} from "../src/services/credit-periods.js";
test("reusable date ranges count inclusive days and reject invalid or excessive dates", () => {
  assert.deepEqual(
    periodInput.parse({
      name: "Özel",
      startsOn: "2028-02-28",
      endsOn: "2028-03-01",
    }),
    { name: "Özel", unit: "DAY", value: 3 },
  );
  assert.equal(
    periodInput.parse({
      name: "Tek gün",
      startsOn: "2028-02-29",
      endsOn: "2028-02-29",
    }).value,
    1,
  );
  for (const pair of [
    ["2027-02-29", "2027-03-01"],
    ["2028-03-01", "2028-02-29"],
    ["2020-01-01", "2040-01-01"],
  ])
    assert.equal(
      periodInput.safeParse({
        name: "Özel",
        startsOn: pair[0],
        endsOn: pair[1],
      }).success,
      false,
    );
});
test("day and calendar month durations are distinct and month end clamps consistently", () => {
  assert.equal(periodEndDate("2028-01-01", { periodMonths: 3 }), "2028-03-31");
  assert.equal(periodEndDate("2028-01-01", { periodDays: 90 }), "2028-03-30");
  assert.equal(periodEndDate("2028-01-31", { periodMonths: 1 }), "2028-02-29");
  assert.equal(periodEndDate("2028-02-29", { periodMonths: 12 }), "2029-02-28");
  assert.equal(periodEndDate("2028-02-29", { periodDays: 1 }), "2028-02-29");
  for (const input of [
    {},
    { periodMonths: 3, periodDays: 90 },
    { periodMonths: 0 },
    { periodDays: 3651 },
  ])
    assert.equal(durationInput.safeParse(input).success, false);
  assert.equal(
    periodInput.parse({ name: "3 aylık", unit: "MONTH", value: 3 }).value,
    3,
  );
  assert.equal(
    periodInput.safeParse({ name: "Çok uzun", unit: "YEAR", value: 11 })
      .success,
    false,
  );
});
