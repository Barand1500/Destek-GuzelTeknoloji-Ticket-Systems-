import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "node:crypto";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const newRefresh = () => randomBytes(48).toString("base64url");
const publicUser = { id: true, name: true, email: true, role: true } as const;
function access(userId: string, sessionId: string) {
  return jwt.sign({ sid: sessionId }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: "15m",
    algorithm: "HS256",
    issuer: "helpdesk",
    audience: "helpdesk-web",
  });
}
async function issue(userId: string) {
  const refreshToken = newRefresh();
  const session = await db.session.create({
    data: {
      userId,
      tokenHash: digest(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: publicUser,
  });
  return { refreshToken, accessToken: access(userId, session.id), user };
}
export async function register(input: {
  name: string;
  email: string;
  password: string;
}) {
  const user = await db.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
    },
  });
  return issue(user.id);
}
// A constant work factor also applies when the email is unknown.
const dummyHash = await bcrypt.hash(randomBytes(32).toString("hex"), 12);
export async function login(input: { email: string; password: string }) {
  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid = await bcrypt.compare(
    input.password,
    user?.passwordHash ?? dummyHash,
  );
  if (!user || !valid)
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "E-posta veya şifre hatalı.",
    );
  return issue(user.id);
}
export async function refresh(token: string) {
  const session = await db.session.findUnique({
    where: { tokenHash: digest(token) },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date())
    throw new AppError(401, "UNAUTHENTICATED", "Oturum süresi doldu.");
  const refreshToken = newRefresh();
  // Compare-and-swap: a refresh token can be exchanged only once, even concurrently.
  const updated = await db.session.updateMany({
    where: {
      id: session.id,
      tokenHash: digest(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { tokenHash: digest(refreshToken) },
  });
  if (updated.count !== 1)
    throw new AppError(401, "UNAUTHENTICATED", "Oturum yenilenemedi.");
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: publicUser,
  });
  return { refreshToken, accessToken: access(user.id, session.id), user };
}
export async function logout(token: string | undefined) {
  if (token)
    await db.session.updateMany({
      where: { tokenHash: digest(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
}
