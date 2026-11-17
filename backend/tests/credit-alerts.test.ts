import test from "node:test";
import assert from "node:assert/strict";
import {
  processCreditAlerts,
  startCreditAlerts,
} from "../src/services/credit-alerts.service.js";

const agreement = (extra = {}) => ({
  id: "a",
  customerId: "owner",
  name: "Bakım",
  credits: 100,
  usedCredits: 80,
  startsOn: new Date("2026-01-01"),
  endsOn: new Date("2026-11-24"),
  deletedAt: null,
  cancelledAt: null,
  ...extra,
});
export function fixture(
  rows = [agreement()],
  settings: any = {
    alertsEnabled: true,
    lowCreditPercent: 20,
    expiryNoticeDays: 7,
    enabled: false,
  },
) {
  const receipts = new Set<string>();
  const notifications: any[] = [];
  const queued: any[] = [];
  const queries: any[] = [];
  const client: any = {
    creditSalesSettings: { findUnique: async () => settings },
    integrationSettings: { findUnique: async () => client.integrations ?? null },
    owner: {
      id: "owner",
      role: "CUSTOMER",
      isActive: true,
      parentCustomerId: null,
      deletedAt: null,
    },
    locks: [] as string[],
    agreement: {
      findMany: async (query: any) => {
        queries.push(query);
        return rows
          .filter((row) => !query.where.id || row.id > query.where.id.gt)
          .slice(0, query.take)
          .map((row) => ({ ...row }));
      },
    },
    $transaction: async (run: any) => {
      client.beforeTransaction?.();
      const before = new Set(receipts);
      const count = notifications.length;
      const queueCount = queued.length;
      try {
        return await run({
          $queryRaw: async (sql: TemplateStringsArray, id: string) => {
            const text = sql.join("?");
            assert.match(text, /FOR UPDATE/);
            if (text.includes("FROM User")) {
              client.locks.push("User");
              return client.owner?.id === id ? [{ ...client.owner }] : [];
            }
            assert.ok(text.includes("FROM Agreement"));
            client.locks.push("Agreement");
            return rows
              .filter((row) => row.id === id)
              .map((row) => ({ ...row }));
          },
          creditAlertReceipt: {
            createMany: async ({ data }: any) => {
              if (receipts.has(data.id)) return { count: 0 };
              receipts.add(data.id);
              return { count: 1 };
            },
          },
          outboundMessage: { upsert: async ({ create }: any) => { if (client.failQueue) throw new Error("queue failed"); const job = { id: create.dedupeKey, ...create }; queued.push(job); return job; } },
          notification: {
            create: async ({ data }: any) => {
              if (client.failNotification) throw new Error("write failed");
              notifications.push(data);
            },
          },
        });
      } catch (error) {
        receipts.clear();
        before.forEach((id) => receipts.add(id));
        notifications.length = count;
        queued.length = queueCount;
        throw error;
      }
    },
  };
  return { client, receipts, notifications, queries, queued };
}
const now = new Date("2026-11-16T21:05:00Z"); // November 17 in Istanbul.
test("emits per agreement alerts with catalog disabled and never repeats after notification deletion", async () => {
  const f = fixture();
  await processCreditAlerts(f.client, now);
  assert.equal(f.notifications.length, 2);
  assert.ok(
    f.notifications.every(
      (n) => n.userId === "owner" && n.message.includes("Bakım"),
    ),
  );
  f.notifications.length = 0;
  await processCreditAlerts(f.client, now);
  assert.equal(f.notifications.length, 0);
  assert.equal(f.receipts.size, 2);
});
test("revalidates changed customer eligibility under User then Agreement locks", async () => {
  for (const changes of [
    { isActive: false },
    { parentCustomerId: "parent" },
    { deletedAt: now },
    { role: "AGENT" },
  ]) {
    const f = fixture();
    f.client.beforeTransaction = () => Object.assign(f.client.owner, changes);
    await processCreditAlerts(f.client, now);
    assert.equal(f.notifications.length, 0);
    assert.equal(f.receipts.size, 0);
    assert.equal(f.client.locks[0], "User");
  }
});
test("revalidates agreement cancellation, deletion, dates and owner after scan", async () => {
  for (const changes of [
    { cancelledAt: now },
    { deletedAt: now },
    { startsOn: new Date("2026-12-01") },
    { endsOn: new Date("2026-11-16") },
    { customerId: "other" },
  ]) {
    const row = agreement();
    const f = fixture([row]);
    f.client.beforeTransaction = () => Object.assign(row, changes);
    await processCreditAlerts(f.client, now);
    assert.equal(f.notifications.length, 0);
    assert.equal(f.receipts.size, 0);
    assert.deepEqual(f.client.locks, ["User", "Agreement"]);
  }
});
test("uses current locked credit balance, expiry, name and fingerprint", async () => {
  const row = agreement();
  const f = fixture([row]);
  f.client.beforeTransaction = () =>
    Object.assign(row, {
      credits: 200,
      usedCredits: 80,
      endsOn: new Date("2026-12-01"),
    });
  await processCreditAlerts(f.client, now);
  assert.equal(f.notifications.length, 0);
  assert.equal(f.receipts.size, 0);
  f.client.beforeTransaction = () =>
    Object.assign(row, { usedCredits: 190, name: "Yeni anlaşma" });
  await processCreditAlerts(f.client, now);
  assert.equal(f.notifications.length, 1);
  assert.match(f.notifications[0].message, /Yeni anlaşma/);
  assert.match(f.notifications[0].message, /200.*10/);
  f.client.beforeTransaction = undefined;
  await processCreditAlerts(f.client, now);
  assert.equal(f.notifications.length, 1);
});
test("uses Istanbul day inclusively and keeps used-credit changes in the same lifecycle", async () => {
  const row = agreement();
  const f = fixture([row]);
  await processCreditAlerts(f.client, now);
  row.usedCredits = 95;
  await processCreditAlerts(f.client, now);
  assert.equal(f.notifications.length, 2);
  row.endsOn = new Date("2026-11-23");
  await processCreditAlerts(f.client, now);
  assert.equal(f.notifications.length, 4);
  assert.equal(
    f.queries[0].where.endsOn.gte.toISOString(),
    "2026-11-17T00:00:00.000Z",
  );
  assert.deepEqual(f.queries[0].where.customer, {
    role: "CUSTOMER",
    isActive: true,
    deletedAt: null,
    parentCustomerId: null,
  });
  assert.equal(f.queries[0].where.deletedAt, null);
  assert.equal(f.queries[0].where.cancelledAt, null);
});
test("disabled alerts do not scan agreements", async () => {
  const f = fixture([], { alertsEnabled: false });
  await processCreditAlerts(f.client, now);
  assert.equal(f.queries.length, 0);
});
test("does not warn above threshold, beyond expiry window, or for zero-credit low balance", async () => {
  const f = fixture([
    agreement({ usedCredits: 79, endsOn: new Date("2026-11-25") }),
    agreement({
      id: "b",
      credits: 0,
      usedCredits: 0,
      endsOn: new Date("2026-12-01"),
    }),
  ]);
  await processCreditAlerts(f.client, now);
  assert.equal(f.notifications.length, 0);
});
test("rolls back durable receipt when notification write fails", async () => {
  const f = fixture();
  f.client.failNotification = true;
  await assert.rejects(processCreditAlerts(f.client, now), /write failed/);
  assert.equal(f.receipts.size, 0);
  f.client.failNotification = false;
  await processCreditAlerts(f.client, now);
  assert.equal(f.notifications.length, 2);
});
test("pages agreements in bounded keyset batches", async () => {
  const f = fixture(
    Array.from({ length: 205 }, (_, i) =>
      agreement({
        id: String(i).padStart(3, "0"),
        usedCredits: 0,
        endsOn: new Date("2026-12-01"),
      }),
    ),
  );
  await processCreditAlerts(f.client, now);
  assert.equal(f.queries.length, 3);
  assert.ok(f.queries.every((q) => q.take === 100));
  assert.equal(f.queries[1].where.id.gt, "099");
  assert.equal(f.queries[2].where.id.gt, "199");
});
test("stop waits for initial in-flight tick and prevents further agreement work", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  let resolveSettings!: (value: any) => void;
  const f = fixture();
  f.client.creditSalesSettings.findUnique = () =>
    new Promise((resolve) => {
      resolveSettings = resolve;
    });
  const stop = startCreditAlerts(f.client);
  let stopped = false;
  const stopping = stop().then(() => {
    stopped = true;
  });
  try {
    await Promise.resolve();
    assert.equal(stopped, false);
    resolveSettings({
      alertsEnabled: true,
      lowCreditPercent: 20,
      expiryNoticeDays: 7,
    });
    await stopping;
    assert.equal(stopped, true);
    assert.equal(f.queries.length, 0);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    await stop();
  }
});

 test("external channels queue once per lifecycle and channel, without conversation or fallback", async () => {
 const f = fixture(undefined, { alertChannels: ['SMS', 'WHATSAPP'], whatsappCreditTemplateName: 'credit_alert', whatsappCreditTemplateLanguage: 'tr' });
 f.client.owner.phone = '+90 532 123 45 67';
 f.client.integrations = { smsEnabled: true, smsApiUser: 'u', smsApiPassword: 'p', smsSender: 'sender', whatsappEnabled: true, whatsappPhoneNumberId: 'id', whatsappAccessToken: 'token' };
 await processCreditAlerts(f.client, now);
 assert.equal(f.receipts.size, 4); assert.equal(f.queued.length, 4); assert.equal(f.notifications.length, 0);
 assert.ok(f.queued.every(j => j.userId === 'owner' && !j.conversationId));
 assert.ok(f.queued.filter(j => j.channel === 'WHATSAPP').every(j => j.payload.whatsappTemplate.parameters.length === 1));
 await processCreditAlerts(f.client, now); assert.equal(f.queued.length, 4);
 });
 test("missing contact or readiness does not consume receipts; later eligible channels receive", async () => {
 const f = fixture(undefined, { alertChannels: ['SMS'] });
 await processCreditAlerts(f.client, now); assert.equal(f.receipts.size, 0); assert.equal(f.notifications.length, 0);
 f.client.owner.phone = '05321234567';
 await processCreditAlerts(f.client, now); assert.equal(f.receipts.size, 0);
 f.client.integrations = { smsEnabled: true, smsApiUser: 'u', smsApiPassword: 'p', smsSender: 'sender' };
 await processCreditAlerts(f.client, now); assert.equal(f.queued.length, 2);
 });
 test("outbox failure rolls back receipts and permits retry", async () => {
 const f = fixture(undefined, { alertChannels: ['IN_APP', 'SMS'] });
 f.client.owner.phone = '05321234567'; f.client.integrations = { smsEnabled: true, smsApiUser: 'u', smsApiPassword: 'p', smsSender: 'sender' };
 f.client.failQueue = true; await assert.rejects(processCreditAlerts(f.client, now), /queue failed/);
 assert.equal(f.receipts.size, 0); assert.equal(f.notifications.length, 0); assert.equal(f.queued.length, 0);
 f.client.failQueue = false; await processCreditAlerts(f.client, now); assert.equal(f.receipts.size, 4); assert.equal(f.queued.length, 2);
 });
 test("legacy IN_APP receipts remain deduplicated when adding another channel", async () => {
 const settings: any = {}; const f = fixture(undefined, settings); await processCreditAlerts(f.client, now);
 settings.alertChannels = ['IN_APP', 'SMS']; f.client.owner.phone = '05321234567'; f.client.integrations = { smsEnabled: true, smsApiUser: 'u', smsApiPassword: 'p', smsSender: 's' };
 await processCreditAlerts(f.client, now); assert.equal(f.notifications.length, 2); assert.equal(f.queued.length, 2);
 });
