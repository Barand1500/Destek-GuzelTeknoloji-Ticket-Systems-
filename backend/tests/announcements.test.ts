import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";

process.env.NODE_ENV = "test";
const { db } = await import("../src/config/db.js");
const { processAnnouncementQueue } =
  await import("../src/services/announcements.service.js");
after(() => db.$disconnect());

test("announcement queue personalizes all channels, attaches files to email, and records provider failures without real sends", async (t) => {
  const announcement = {
    id: "announcement",
    title: "Toplantı",
    body: "Merhaba {isim}, " + "Bilgilendirme. ".repeat(30),
    eventAt: null,
    files: [
      {
        originalName: "bilgi.txt",
        storageKey: "test-storage-key",
        mimeType: "text/plain",
        size: 20,
      },
    ],
  };
  const pending = [
    {
      id: "notification",
      userId: "recipient",
      recipientName: "Deniz",
      channel: "NOTIFICATION",
      address: null,
      announcement,
    },
    {
      id: "email",
      userId: "recipient",
      recipientName: "Deniz",
      channel: "EMAIL",
      address: "deniz@example.test",
      announcement,
    },
    {
      id: "sms",
      userId: "recipient",
      recipientName: "Deniz",
      channel: "SMS",
      address: "05551234567",
      announcement,
    },
    {
      id: "rejected",
      userId: "recipient",
      recipientName: "Deniz",
      channel: "SMS",
      address: "05557654321",
      announcement,
    },
    {
      id: "inactive",
      userId: "inactive",
      recipientName: "Pasif",
      channel: "NOTIFICATION",
      address: null,
      announcement,
    },
  ];
  const results = new Map<string, { status: string; error?: string }>();
  const notifications: any[] = [],
    mails: any[] = [],
    messages: any[] = [];
  const restorers: Array<() => void> = [];
  function stub(target: any, key: string, value: any) {
    const original = target[key];
    target[key] = value;
    restorers.push(() => {
      target[key] = original;
    });
  }
  t.after(() => restorers.reverse().forEach((restore) => restore()));
  const update = async ({ where, data }: any) => {
    results.set(where.id, data);
    return data;
  };
  stub(db.announcementDelivery, "findMany", async () => pending);
  stub(db.announcementDelivery, "updateMany", async () => ({ count: 1 }));
  stub(db.announcementDelivery, "update", update);
  stub(db.user, "findFirst", async ({ where }: any) =>
    where.id === "inactive" ? null : { id: "recipient" },
  );
  stub(db, "$transaction", async (work: any) =>
    work({
      notification: {
        create: async ({ data }: any) => {
          notifications.push(data);
        },
      },
      announcementDelivery: { update },
    }),
  );
  stub(db.integrationSettings, "findUnique", async () => ({
    smtpEnabled: true,
    smtpHost: "smtp.example.test",
    smtpPort: 587,
    smtpSecure: true,
    smtpFromAddress: "support@example.test",
    smtpUser: "test",
    smtpPassword: "fake",
    smsEnabled: true,
    smsApiUser: "test",
    smsApiPassword: "fake",
    smsSender: "DESTEK",
  }));
  t.mock.method(
    nodemailer,
    "createTransport",
    () =>
      ({
        sendMail: async (mail: any) => {
          mails.push(mail);
          return { accepted: [mail.to], rejected: [], response: "250 OK" };
        },
      }) as any,
  );
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://api.netgsm.com.tr/sms/rest/v2/send");
    const payload = JSON.parse(options!.body as string);
    messages.push(payload);
    return new Response(
      JSON.stringify(
        payload.messages[0].no === "5557654321"
          ? { code: "30", description: "Reddedildi" }
          : { code: "00", jobid: "fake-job" },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  await processAnnouncementQueue();
  assert.equal(notifications.length, 1);
  assert.match(notifications[0].message, /^Merhaba Deniz/);
  assert.ok(notifications[0].message.length <= 180);
  assert.equal(mails.length, 1);
  assert.match(mails[0].text, /^Merhaba Deniz/);
  assert.ok(mails[0].text.length > 180);
  assert.equal(mails[0].attachments[0].filename, "bilgi.txt");
  assert.equal(messages.length, 2);
  assert.match(messages[0].messages[0].msg, /^Toplantı\nMerhaba Deniz/);
  for (const id of ["notification", "email", "sms"])
    assert.equal(results.get(id)?.status, "SENT");
  assert.equal(results.get("rejected")?.status, "FAILED");
  assert.equal(results.get("inactive")?.status, "FAILED");
  assert.match(results.get("inactive")!.error!, /aktif değil/);
});
