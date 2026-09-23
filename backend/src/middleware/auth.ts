import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { db } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import type { Role } from "../generated/prisma/client.js";
export async function resolveActor(token: string | undefined) {
  if (!token)
    throw new AppError(401, "UNAUTHENTICATED", "Oturum açmanız gerekiyor.");
  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: "helpdesk",
      audience: "helpdesk-web",
    });
    if (
      typeof decoded === "string" ||
      typeof decoded.sid !== "string" ||
      !decoded.sub
    )
      throw new Error();
    payload = decoded;
  } catch {
    throw new AppError(401, "UNAUTHENTICATED", "Oturum süresi doldu.");
  }
  const session = await db.session.findUnique({
    where: { id: payload.sid },
    include: { user: { include: { departments: true } } },
  });
  if (
    !session ||
    session.userId !== payload.sub ||
    session.revokedAt ||
    session.expiresAt <= new Date() || !session.user.isActive
  )
    throw new AppError(401, "UNAUTHENTICATED", "Oturum süresi doldu.");
  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email ?? "",
    role: user.role,
    departmentIds: user.departments.map((d) => d.departmentId),
    sessionId: session.id,
  };
  
}
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
  req.actor = {...await resolveActor(token), ipAddress:req.ip??null};
  next();
};
export const authorize =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!roles.includes(req.actor.role))
      throw new AppError(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.");
    next();
  };
