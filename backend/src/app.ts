import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { router } from "./routes/index.js";
import { errorHandler } from "./utils/errors.js";
import { env, allowedOrigins } from "./config/env.js";
import { db } from "./config/db.js";
import { createHash } from 'node:crypto';
import path from 'node:path';
export const app = express();
app.disable("x-powered-by");
app.set('trust proxy',env.TRUST_PROXY_HOPS);
app.use(
  helmet(),
  cors({ origin: (origin, done) => done(null, !origin || allowedOrigins.has(origin)), credentials: true }),
  express.json({ limit: "100kb", verify: (req, _res, buffer) => { (req as any).rawBody = Buffer.from(buffer); } }),
  cookieParser(),
);
app.get("/api/health", async (_req, res, next) => {
  try {
    const [version] = await db.$queryRawUnsafe<Array<{ version: string }>>("SELECT VERSION() AS version");
    const versionString = version?.version?.toLowerCase() ?? "";

const database = versionString.includes("mariadb")
  ? "mariadb"
  : versionString.includes("mysql")
    ? "mysql"
    : "unknown";
    res.json({ success: true, data: { status: "ok", database }, ...(env.NODE_ENV==='development'?{instance:createHash('sha256').update(path.resolve(process.cwd(),'..').toLowerCase()).digest('hex').slice(0,16)}:{}) });
  } catch (error) {
    next(error);
  }
});
app.use("/api/v1", router);
app.use((_req, res) =>
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Adres bulunamadı." },
  }),
);
app.use(errorHandler);
