import bcrypt from "bcrypt";
import { createHmac, randomInt, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { sendSupportEmail } from "./mailer.service.js";

const hash = (value: string) => createHmac("sha256", env.JWT_ACCESS_SECRET).update(value).digest("hex");
const invalid = () => new AppError(400, "INVALID_RESET", "Kod geçersiz veya süresi dolmuş. Yeni kod isteyin.");

export async function requestPasswordReset(email: string, send = sendSupportEmail) {
  // Contacts without a login identity cannot acquire an account through recovery.
  const user = await db.user.findUnique({ where: { loginEmail: email } });
  if (!user?.isActive || user.deletedAt) return;
  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  const reset = await db.$transaction(async tx => {
    const existing = await tx.passwordReset.findUnique({ where: { userId: user.id } });
    if (existing && now.getTime() - existing.createdAt.getTime() < 60_000)
      throw new AppError(429, "RESET_COOLDOWN", "Yeni kod için bir dakika bekleyin.");
    return tx.passwordReset.upsert({ where: { userId: user.id },
      create: { userId: user.id, codeHash: hash(`${user.id}:${code}`), expiresAt: new Date(now.getTime() + 600_000) },
      update: { codeHash: hash(`${user.id}:${code}`), tokenHash: null, attempts: 0, createdAt: now, expiresAt: new Date(now.getTime() + 600_000) },
    });
  });
  try {
    await send(email, "Şifre yenileme kodunuz", `Şifre yenileme kodunuz: ${code}\n\nKod 10 dakika geçerlidir. Bu işlemi siz başlatmadıysanız bu e-postayı dikkate almayın.`);
  } catch {
    await db.passwordReset.deleteMany({ where: { id: reset.id, codeHash: reset.codeHash } });
    throw new AppError(503, "RESET_EMAIL_FAILED", "Kod e-postası gönderilemedi. Lütfen daha sonra tekrar deneyin.");
  }
}

export async function verifyPasswordReset(email: string, code: string) {
  const user = await db.user.findUnique({ where: { loginEmail: email } });
  if (!user?.isActive || user.deletedAt) throw invalid();
  const reset = await db.passwordReset.findUnique({ where: { userId: user.id } });
  if (!reset || reset.expiresAt <= new Date() || reset.tokenHash) throw invalid();
  const attempt = await db.passwordReset.updateMany({ where: { id: reset.id, codeHash: reset.codeHash, attempts: { lt: 5 }, tokenHash: null, expiresAt: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
  if (!attempt.count || !timingSafeEqual(Buffer.from(reset.codeHash), Buffer.from(hash(`${user.id}:${code}`)))) throw invalid();
  const token = randomBytes(32).toString("base64url");
  const verified = await db.passwordReset.updateMany({ where: { id: reset.id, codeHash: reset.codeHash, tokenHash: null, expiresAt: { gt: new Date() } }, data: { tokenHash: hash(token) } });
  if (!verified.count) throw invalid();
  return token;
}

export async function completePasswordReset(token: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  await db.$transaction(async tx => {
    const reset = await tx.passwordReset.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
    if (!reset || reset.expiresAt <= new Date() || !reset.user.isActive || reset.user.deletedAt) throw invalid();
    const consumed = await tx.passwordReset.deleteMany({ where: { id: reset.id, tokenHash: hash(token), expiresAt: { gt: new Date() } } });
    if (!consumed.count) throw invalid();
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
    await tx.session.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  });
}
