import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/config/db.js";
import {
  mergeCustomers,
  mergeCustomersInput,
} from "../src/services/customer-merge.service.js";
import { persistInboundMessage } from "../src/services/integrations.service.js";
import type { Actor } from "../src/types/express.js";

test("merging customers preserves primary identity, contacts, messages, files and ticket numbers and revokes duplicate sessions", async () => {
  const suffix = randomUUID(),
    ids: string[] = [],
    conversationIds: string[] = [];
  const department = await db.department.create({
    data: { name: "Merge test " + suffix },
  });
  let actorId: string | undefined;
  try {
    const admin = await db.user.create({
      data: {
        name: "Merge admin " + suffix,
        role: "ADMIN",
        passwordHash: "test-only",
      },
    });
    actorId = admin.id;
    const actor = {
      id: admin.id,
      name: admin.name,
      email: "",
      role: "ADMIN",
      departmentIds: [],
      sessionId: "test",
    } as Actor;
    const target = await db.user.create({
      data: {
        name: "Primary " + suffix,
        role: "CUSTOMER",
        email: `primary-${suffix}@test.invalid`,
        phone: "+90 532 111 22 33",
        company: "Primary company",
        staffNote: "Primary note",
        passwordHash: "primary-password",
      },
    });
    ids.push(target.id);
    const a = await db.user.create({
      data: {
        name: "Duplicate A " + suffix,
        role: "CUSTOMER",
        email: `other-${suffix}@test.invalid`,
        extraEmails: target.email!.toUpperCase(),
        phone: "0532 111 22 33",
        company: "Other company",
        staffNote: "Source note",
        loginEmail: `duplicate-${suffix}@test.invalid`,
        passwordHash: "source-password",
      },
    });
    ids.push(a.id);
    const c = await db.user.create({
      data: {
        name: "Duplicate B " + suffix,
        role: "CUSTOMER",
        phone: "0555 222 33 44",
        extraEmails: a.email,
        passwordHash: "test-only",
      },
    });
    ids.push(c.id);
    const ticketNumbers: number[] = [];
    for (const customer of [target, a, c]) {
      const conversation = await db.conversation.create({
        data: {
          customerId: customer.id,
          departmentId: department.id,
          subject: "Merge test",
          searchSubject: "merge test",
          channel: "WHATSAPP",
          ...(customer.id === c.id ? { status: "CLOSED" } : {}),
        },
      });
      conversationIds.push(conversation.id);
      ticketNumbers.push(conversation.number);
      await db.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          authorId: customer.id,
          body: customer.name,
        },
      });
    }
    const message = await db.conversationMessage.findFirstOrThrow({
      where: { conversationId: conversationIds[1] },
    });
    const attachment = await db.conversationAttachment.create({
      data: {
        messageId: message.id,
        uploaderId: a.id,
        originalName: "photo.png",
        mimeType: "image/png",
        size: 10,
        storageKey: randomUUID(),
      },
    });
    const file = await db.customerAttachment.create({
      data: {
        customerId: a.id,
        originalName: "file.txt",
        mimeType: "text/plain",
        size: 10,
        storageKey: randomUUID(),
      },
    });
    await db.conversationParticipant.createMany({
      data: [
        { conversationId: conversationIds[1], userId: target.id },
        { conversationId: conversationIds[1], userId: a.id },
      ],
    });
    const session = await db.session.create({
      data: {
        userId: a.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    assert.equal(
      mergeCustomersInput.safeParse({ sourceIds: [a.id, a.id] }).success,
      false,
    );
    await assert.rejects(
      mergeCustomers(actor, target.id, { sourceIds: [target.id] }),
      /kendisiyle/,
    );
    await assert.rejects(
      mergeCustomers(
        {
          ...actor,
          accessRole: {
            id: randomUUID(),
            name: "Limited",
            scope: "ALL",
            permissions: ["customers.update"],
          },
        },
        target.id,
        { sourceIds: [a.id] },
      ),
      /yetkisi/,
    );
    await assert.rejects(
      mergeCustomers(
        { ...actor, roleScope: "DEPARTMENT", departmentIds: [] },
        target.id,
        { sourceIds: [a.id] },
      ),
      /kapsamınız/,
    );
    const result = await mergeCustomers(actor, target.id, {
      sourceIds: [a.id, c.id],
    });
    assert.equal(result.customer.name, target.name);
    assert.equal(result.mergedCount, 2);
    assert.equal(result.movedConversationCount, 2);
    const primary = await db.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    assert.equal(primary.passwordHash, "primary-password");
    assert.equal(primary.phone, target.phone);
    assert.equal(primary.extraPhones, "0555 222 33 44");
    assert.equal(primary.extraEmails, a.email);
    assert.equal(primary.company, "Primary company");
    assert.match(primary.staffNote!, /Other company.*Source note/);
    assert.ok(primary.staffNote!.startsWith('Primary note\n'));
    assert.ok(primary.staffNote!.includes(`İşlemi yapan: ${admin.name}`));
    assert.equal(
      await db.conversation.count({ where: { customerId: target.id } }),
      3,
    );
    assert.deepEqual(
      (
        await db.conversation.findMany({
          where: { id: { in: conversationIds } },
          orderBy: { number: "asc" },
        })
      ).map((item) => item.number),
      ticketNumbers,
    );
    assert.equal(
      await db.conversationMessage.count({
        where: { conversationId: { in: conversationIds }, authorId: target.id },
      }),
      3,
    );
    assert.equal(
      (
        await db.conversationAttachment.findUniqueOrThrow({
          where: { id: attachment.id },
        })
      ).uploaderId,
      target.id,
    );
    assert.equal(
      (
        await db.customerAttachment.findUniqueOrThrow({
          where: { id: file.id },
        })
      ).customerId,
      target.id,
    );
    assert.ok(
      (await db.session.findUniqueOrThrow({ where: { id: session.id } }))
        .revokedAt,
    );
    assert.equal(
      await db.conversationParticipant.count({
        where: { conversationId: conversationIds[1] },
      }),
      1,
    );
    for (const sourceId of [a.id, c.id]) {
      const archived = await db.user.findUniqueOrThrow({
        where: { id: sourceId },
      });
      assert.ok(archived.deletedAt);
      assert.equal(archived.isActive, false);
      assert.equal(archived.loginEmail, null);
    }
    await assert.rejects(
      mergeCustomers(actor, target.id, { sourceIds: [a.id] }),
      /kullanılamıyor/,
    );
    assert.equal(
      await persistInboundMessage({
        provider: "merge-test",
        externalId: suffix,
        channel: "WHATSAPP",
        sender: { phone: c.phone! },
        body: "Follow-up",
      }),
      conversationIds[2],
    );
    assert.equal(
      await db.user.count({ where: { id: { in: ids }, deletedAt: null } }),
      1,
    );
  } finally {
    await db.notification.deleteMany({
      where: {
        OR: [
          { conversationId: { in: conversationIds } },
          { userId: { in: ids } },
        ],
      },
    });
    await db.externalMessage.deleteMany({
      where: { conversationId: { in: conversationIds } },
    });
    await db.conversationMessage.deleteMany({
      where: { conversationId: { in: conversationIds } },
    });
    await db.conversation.deleteMany({
      where: { id: { in: conversationIds } },
    });
    await db.activityLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: [...ids, ...conversationIds] } },
          ...(actorId ? [{ userId: actorId }] : []),
        ],
      },
    });
    await db.user.deleteMany({
      where: { id: { in: [...ids, ...(actorId ? [actorId] : [])] } },
    });
    await db.department.delete({ where: { id: department.id } });
    await db.$disconnect();
  }
});
