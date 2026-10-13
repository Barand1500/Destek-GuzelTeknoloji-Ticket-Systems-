import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { db } from "../src/config/db.js";
import { requestPasswordReset, verifyPasswordReset, completePasswordReset } from "../src/services/password-reset.service.js";

test("email reset codes expire, limit attempts, are single-use and revoke sessions", async () => {
  const email = `reset-${randomUUID()}@test.invalid`;
  const user = await db.user.create({ data: { name: "Reset test", email, loginEmail: email, passwordHash: await bcrypt.hash("old-password", 4) } });
  let code = "";
  const send = async (_to: string, _subject: string, text: string) => {
    code = text.match(/\b\d{6}\b/)![0];
    return { sent: true, accepted: 1, rejected: 0, response: "ok", messageId: "test" };
  };
  try {
    await requestPasswordReset(email, send);
    await assert.rejects(requestPasswordReset(email, send));
    for (let i = 0; i < 5; i++) await assert.rejects(verifyPasswordReset(email, "000000"));
    await assert.rejects(verifyPasswordReset(email, code));
    await db.passwordReset.update({ where: { userId: user.id }, data: { createdAt: new Date(0) } });
    await requestPasswordReset(email, send);
    await db.passwordReset.update({ where: { userId: user.id }, data: { expiresAt: new Date(0), createdAt: new Date(0) } });
    await assert.rejects(verifyPasswordReset(email, code));
    await requestPasswordReset(email, send);
    const token = await verifyPasswordReset(email, code);
    await assert.rejects(verifyPasswordReset(email, code));
    await assert.rejects(completePasswordReset("invalid-token", "new-password"));
    const session = await db.session.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60_000) } });
    await completePasswordReset(token, "new-password");
    assert.equal(await bcrypt.compare("new-password", (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash), true);
    assert.ok((await db.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt);
    await assert.rejects(completePasswordReset(token, "another-password"));
    code = "";
    await requestPasswordReset(`unknown-${randomUUID()}@test.invalid`, send);
    assert.equal(code, "");
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
