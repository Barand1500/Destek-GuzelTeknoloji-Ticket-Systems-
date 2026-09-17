import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate, authorize } from "../middleware/auth.js";
import * as auth from "../services/auth.service.js";
import * as tickets from "../services/tickets.service.js";
import {
  createTicketSchema,
  idSchema,
  listSchema,
  loginSchema,
  messageSchema,
  paginationSchema,
  registerSchema,
  updateTicketSchema,
} from "../validators/index.js";
import { env } from "../config/env.js";
import { db } from "../config/db.js";
import { AppError } from "../utils/errors.js";
export const router = Router();
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/v1/auth",
  maxAge: 7 * 86400000,
};
function sendSession(
  res: Response,
  result: Awaited<ReturnType<typeof auth.login>>,
  status = 200,
) {
  res
    .cookie("refreshToken", result.refreshToken, cookieOptions)
    .status(status)
    .json({
      success: true,
      data: { accessToken: result.accessToken, user: result.user },
    });
}
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Çok fazla deneme. Lütfen daha sonra tekrar deneyin.",
    },
  },
});
router.use("/auth", authLimiter, (req, _res, next) => {
  if (
    req.method !== "GET" &&
    req.headers.origin &&
    req.headers.origin !== env.FRONTEND_URL
  )
    throw new AppError(
      403,
      "INVALID_ORIGIN",
      "İstek kaynağına izin verilmiyor.",
    );
  next();
});
router.post("/auth/register", async (req, res) =>
  sendSession(res, await auth.register(registerSchema.parse(req.body)), 201),
);
router.post("/auth/login", async (req, res) =>
  sendSession(res, await auth.login(loginSchema.parse(req.body))),
);
router.post("/auth/refresh", async (req, res) => {
  const token = z.string().min(1).safeParse(req.cookies?.refreshToken);
  if (!token.success)
    throw new AppError(401, "UNAUTHENTICATED", "Oturum açmanız gerekiyor.");
  sendSession(res, await auth.refresh(token.data));
});
router.post("/auth/logout", async (req, res) => {
  await auth.logout(
    typeof req.cookies?.refreshToken === "string"
      ? req.cookies.refreshToken
      : undefined,
  );
  res
    .clearCookie("refreshToken", { ...cookieOptions, maxAge: undefined })
    .json({ success: true, data: null });
});
router.use(authenticate);
router.get("/auth/me", (req, res) => {
  const { sessionId, ...user } = req.actor;
  res.json({ success: true, data: user });
});
router.get("/departments", async (_req, res) =>
  res.json({
    success: true,
    data: await db.department.findMany({ orderBy: { name: "asc" }, take: 100 }),
  }),
);
router.post("/departments", authorize("ADMIN"), async (req, res) => {
  const input = z
    .object({ name: z.string().trim().min(2).max(100) })
    .strict()
    .parse(req.body);
  const data = await db.$transaction(async (tx) => {
    const department = await tx.department.create({ data: input });
    await tx.activityLog.create({
      data: {
        userId: req.actor.id,
        action: "department.created",
        entityId: department.id,
      },
    });
    return department;
  });
  res.status(201).json({ success: true, data });
});
router.get("/agents", authorize("ADMIN", "SUPERVISOR"), async (req, res) => {
  const departmentId = idSchema.parse(req.query.departmentId);
  if (
    req.actor.role === "SUPERVISOR" &&
    !req.actor.departmentIds.includes(departmentId)
  )
    throw new AppError(403, "FORBIDDEN", "Departmana erişiminiz yok.");
  res.json({
    success: true,
    data: await db.user.findMany({
      where: { role: "AGENT", departments: { some: { departmentId } } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
  });
});
router.get("/dashboard", async (req, res) =>
  res.json({ success: true, data: await tickets.summary(req.actor) }),
);
router.get("/tickets", async (req, res) =>
  res.json({
    success: true,
    ...(await tickets.listTickets(req.actor, listSchema.parse(req.query))),
  }),
);
router.post("/tickets", async (req, res) =>
  res.status(201).json({
    success: true,
    data: await tickets.createTicket(
      req.actor,
      createTicketSchema.parse(req.body),
    ),
  }),
);
router.get("/tickets/:id", async (req, res) =>
  res.json({
    success: true,
    data: await tickets.getTicket(req.actor, idSchema.parse(req.params.id)),
  }),
);
router.patch("/tickets/:id", async (req, res) =>
  res.json({
    success: true,
    data: await tickets.updateTicket(
      req.actor,
      idSchema.parse(req.params.id),
      updateTicketSchema.parse(req.body),
    ),
  }),
);
router.get("/tickets/:id/messages", async (req, res) => {
  const { page, limit } = paginationSchema.parse(req.query);
  res.json({
    success: true,
    ...(await tickets.messages(
      req.actor,
      idSchema.parse(req.params.id),
      page,
      limit,
    )),
  });
});
router.post("/tickets/:id/messages", async (req, res) =>
  res.status(201).json({
    success: true,
    data: await tickets.addMessage(
      req.actor,
      idSchema.parse(req.params.id),
      messageSchema.parse(req.body),
    ),
  }),
);
