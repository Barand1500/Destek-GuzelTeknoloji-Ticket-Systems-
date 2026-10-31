import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "../src/config/db.js";
import { uploadRoot } from "../src/services/uploads.service.js";

const confirmed = process.argv.includes("--confirm");

const result = await db.$transaction(async (tx) => {
  const conversations = await tx.conversation.findMany({
    select: {
      id: true,
      customerId: true,
      messages: {
        select: {
          id: true,
          attachments: { select: { storageKey: true } },
        },
      },
    },
  });

  const conversationIds = conversations.map((item) => item.id);
  const survivingConversationIds = await tx.conversation.findMany({
    select: { id: true },
  });
  const survivingIds = survivingConversationIds.map((item) => item.id);
  const customerIds = [...new Set(conversations.map((item) => item.customerId))];
  const messageIds = conversations.flatMap((item) => item.messages.map((message) => message.id));
  const conversationStorageKeys = conversations.flatMap((item) =>
    item.messages.flatMap((message) => message.attachments.map((file) => file.storageKey)),
  );
  const customerFiles = customerIds.length
    ? await tx.customerAttachment.findMany({
        where: { customerId: { in: customerIds } },
        select: { storageKey: true },
      })
    : [];
  const customerUsers = customerIds.length
    ? await tx.user.findMany({
        where: { id: { in: customerIds }, role: "CUSTOMER" },
        select: { id: true },
      })
    : [];
  const customerUserIds = customerUsers.map((user) => user.id);

  const counts = {
    conversations: conversationIds.length,
    messages: messageIds.length,
    activityLogs: conversationIds.length
      ? await tx.activityLog.count({ where: { entityId: { in: conversationIds } } })
      : 0,
    notifications: conversationIds.length
      ? await tx.notification.count({ where: { conversationId: { in: conversationIds } } })
      : 0,
    orphanedConversationLogs: await tx.activityLog.count({
      where: {
        action: { startsWith: "conversation." },
        ...(survivingIds.length ? { entityId: { notIn: survivingIds } } : {}),
      },
    }),
    orphanedConversationNotifications: await tx.notification.count({
      where: {
        conversationId: { not: null },
        ...(survivingIds.length ? { conversationId: { notIn: survivingIds } } : {}),
      },
    }),
    conversationFiles: conversationStorageKeys.length,
    customerFiles: customerFiles.length,
    customers: customerUserIds.length,
  };

  if (!confirmed) return { counts, storageKeys: [] as string[] };

  if (messageIds.length) {
    await tx.conversationMessageMention.deleteMany({ where: { messageId: { in: messageIds } } });
    await tx.conversationAttachment.deleteMany({ where: { messageId: { in: messageIds } } });
    await tx.conversationMessage.deleteMany({ where: { id: { in: messageIds } } });
  }
  if (conversationIds.length) {
    await tx.activityLog.deleteMany({ where: { entityId: { in: conversationIds } } });
    await tx.notification.deleteMany({ where: { conversationId: { in: conversationIds } } });
    await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  }
  await tx.activityLog.deleteMany({
    where: {
      action: { startsWith: "conversation." },
      ...(survivingIds.length ? { entityId: { notIn: survivingIds } } : {}),
    },
  });
  await tx.notification.deleteMany({
    where: {
      conversationId: { not: null },
      ...(survivingIds.length ? { conversationId: { notIn: survivingIds } } : {}),
    },
  });
  if (customerUserIds.length) {
    await tx.customerAttachment.deleteMany({ where: { customerId: { in: customerUserIds } } });
    await tx.activityLog.deleteMany({ where: { userId: { in: customerUserIds } } });
    await tx.notification.deleteMany({ where: { userId: { in: customerUserIds } } });
    await tx.outboundMessage.deleteMany({ where: { userId: { in: customerUserIds } } });
    await tx.session.deleteMany({ where: { userId: { in: customerUserIds } } });
    await tx.passwordReset.deleteMany({ where: { userId: { in: customerUserIds } } });
    await tx.user.deleteMany({ where: { id: { in: customerUserIds } } });
  }

  return {
    counts,
    storageKeys: [...conversationStorageKeys, ...customerFiles.map((file) => file.storageKey)],
  };
});

console.log(confirmed ? "Silme tamamlandı." : "ÖNİZLEME: hiçbir kayıt silinmedi.");
console.table(result.counts);

if (confirmed) {
  const failures: string[] = [];
  for (const storageKey of result.storageKeys) {
    try {
      await unlink(path.join(uploadRoot, storageKey));
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "UNKNOWN";
      if (code !== "ENOENT") failures.push(`${storageKey} (${String(code)})`);
    }
  }
  if (failures.length) {
    console.error("Bazı fiziksel dosyalar silinemedi:", failures.join(", "));
    process.exitCode = 1;
  }
}

await db.$disconnect();
