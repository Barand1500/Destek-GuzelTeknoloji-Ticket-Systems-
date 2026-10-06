import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Actor } from "../src/types/express.js";

process.env.NODE_ENV = "test";
const { db } = await import("../src/config/db.js");
const { listAnnouncements } = await import("../src/services/announcements.service.js");

test("announcement search works on MySQL and preserves recipient visibility and pagination", async () => {
  const marker = randomUUID();
  const reader: Actor = { id: randomUUID(), name: "Reader", role: "AGENT", email: "reader@example.test", departmentIds: [], sessionId: randomUUID() };
  const ids: string[] = [];
  try {
    for (let index = 0; index < 2; index++) {
      const row = await db.announcement.create({ data: {
        authorId: randomUUID(), authorName: `Author ${marker}`, title: `Meeting ${marker}`, body: `Message ${marker}`, priority: "NORMAL", departmentName: `Department ${marker}`, files: [],
        ...(index === 0 ? { deliveries: { create: { userId: reader.id, recipientName: reader.name, channel: "NOTIFICATION", status: "SENT" } } } : {}),
      } });
      ids.push(row.id);
    }
    for (const field of ["Meeting", "Message", "Author", "Department"]) {
      const result = await listAnnouncements(reader, 1, 8, `${field.toLowerCase()} ${marker}`);
      assert.deepEqual(result.data.map(row => row.id), [ids[0]]);
      assert.equal(result.pagination.total, 1);
    }
    const admin: Actor = { ...reader, role: "ADMIN" };
    const first = await listAnnouncements(admin, 1, 1, marker);
    const second = await listAnnouncements(admin, 2, 1, marker);
    assert.equal(first.pagination.total, 2);
    assert.notEqual(first.data[0].id, second.data[0].id);
  } finally {
    await db.announcement.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
