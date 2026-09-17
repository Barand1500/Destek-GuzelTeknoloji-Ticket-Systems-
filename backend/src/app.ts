import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { router } from "./routes/index.js";
import { errorHandler } from "./utils/errors.js";
import { env } from "./config/env.js";
export const app = express();
app.disable("x-powered-by");
app.use(
  helmet(),
  cors({ origin: env.FRONTEND_URL, credentials: true }),
  express.json({ limit: "100kb" }),
  cookieParser(),
);
app.get("/api/health", (_req, res) =>
  res.json({ success: true, data: { status: "ok" } }),
);
app.use("/api/v1", router);
app.use((_req, res) =>
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "Adres bulunamadı." },
  }),
);
app.use(errorHandler);
