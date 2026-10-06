import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { integrationSettingsSchema } from '../src/validators/management.js';

test('WhatsApp access tokens longer than 191 characters validate and persist without truncation', async () => {
  const id = `token-test-${randomUUID()}`;
  try {
    const defaults = await db.integrationSettings.create({ data: { id } });
    const input = Object.fromEntries(Object.keys(integrationSettingsSchema.shape).filter(key => key !== 'emailNotifications').map(key => [key, defaults[key as keyof typeof defaults]]));
    Object.assign(input, { whatsappEnabled: true, whatsappAppId: '123456789', whatsappAppSecret: 'fake-test-secret', whatsappPhoneNumberId: '987654321', whatsappVerifyToken: 'fake-webhook-token' });
    for (const length of [300, 1024, 8192]) {
      const token = 'a'.repeat(length);
      const parsed = integrationSettingsSchema.parse({ ...input, whatsappAccessToken: token });
      await db.integrationSettings.update({ where: { id }, data: { whatsappAccessToken: parsed.whatsappAccessToken } });
      const saved = await db.integrationSettings.findUniqueOrThrow({ where: { id }, select: { whatsappAccessToken: true } });
      assert.equal(saved.whatsappAccessToken, token);
    }
    assert.equal(integrationSettingsSchema.safeParse({ ...input, whatsappAccessToken: 'a'.repeat(8193) }).success, false);
  } finally {
    await db.integrationSettings.deleteMany({ where: { id } });
    await db.$disconnect();
  }
});
