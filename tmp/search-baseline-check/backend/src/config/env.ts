import "dotenv/config";
import { z } from "zod";
export const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('127.0.0.1'),
    TRUST_PROXY_HOPS:z.coerce.number().int().min(0).max(3).default(0),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    FRONTEND_URL: z.url().default("http://localhost:5173"),
    // Extra development origins are deliberately fixed; production accepts only FRONTEND_URL.
    DEV_FRONTEND_URLS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
    UPLOAD_DIR: z.string().default('uploads'),
    // 25 MB per file; cap the environment value to prevent unbounded uploads.
    MAX_FILE_SIZE: z.coerce.number().int().min(1024).max(26214400).default(26214400),
    SMTP_HOST: z.string().trim().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().trim().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    // SMTP_PASS and SMTP_SECURE are common provider variable names.
    SMTP_PASS: z.string().min(1).optional(),
    SMTP_SECURE: z.enum(["true", "false"]).optional().transform(value => value === "true"),
    // Nodemailer accepts both mail@company.com and Company Support <mail@company.com>.
    SMTP_FROM: z.string().trim().min(3).optional(),
    IMAP_HOST: z.string().trim().min(1).optional(),
    IMAP_PORT: z.coerce.number().int().positive().default(993),
    IMAP_USER: z.string().trim().min(1).optional(),
    IMAP_PASSWORD: z.string().min(1).optional(),
    IMAP_PASS: z.string().min(1).optional(),
    IMAP_SECURE: z.enum(["true", "false"]).optional().transform(value => value === "true"),
    IMAP_MAILBOX: z.string().trim().min(1).default("INBOX"),
    IMAP_POLL_INTERVAL_SECONDS: z.coerce.number().int().min(15).max(3600).default(15),
    IMAP_LOOKBACK_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  })
  .parse(process.env);

export const allowedOrigins = new Set(
  (env.NODE_ENV === "production" ? [env.FRONTEND_URL] : env.DEV_FRONTEND_URLS.split(","))
    .map((value) => value.trim())
    .filter(Boolean),
);
allowedOrigins.add(env.FRONTEND_URL);
