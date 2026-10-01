import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  netgsmRecipient,
  whatsappRecipient,
  testNetgsmConnection,
  testWhatsappConnection,
} = await import("../src/services/integrations.service.js");

test("channel integrations normalize Turkish recipient numbers", () => {
  for (const value of ["0555 123 45 67", "+90 555 123 45 67", "0090 555 123 45 67", "5551234567"])
    assert.equal(netgsmRecipient(value), "5551234567");
  for (const value of ["0555 123 45 67", "+90 555 123 45 67", "0090 555 123 45 67", "5551234567"])
    assert.equal(whatsappRecipient(value), "905551234567");
});

test("Netgsm test verifies Basic Auth and the configured sender header", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "https://api.netgsm.com.tr/sms/rest/v2/msgheader");
      assert.equal(new Headers(init?.headers).get("authorization"), `Basic ${Buffer.from("8500000000:secret").toString("base64")}`);
      return new Response(JSON.stringify({ code: "00", msgheaders: ["DESTEK"], description: "success" }), { status: 200 });
    };
    assert.deepEqual(await testNetgsmConnection({ smsApiUser: "8500000000", smsApiPassword: "secret", smsSender: "destek" }), ["DESTEK"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("provider connection tests expose provider errors", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ code: "30", description: "invalid credentials" }), { status: 401 });
    await assert.rejects(testNetgsmConnection({ smsApiUser: "bad", smsApiPassword: "bad", smsSender: "DESTEK" }), /invalid credentials/);

    globalThis.fetch = async (input, init) => {
      assert.match(String(input), /^https:\/\/graph\.facebook\.com\/v25\.0\/123/);
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer token");
      return new Response(JSON.stringify({ id: "123", display_phone_number: "+90 555 123 45 67", verified_name: "Destek" }), { status: 200 });
    };
    assert.equal((await testWhatsappConnection({ whatsappPhoneNumberId: "123", whatsappAccessToken: "token" })).id, "123");
  } finally { globalThis.fetch = originalFetch; }
});
