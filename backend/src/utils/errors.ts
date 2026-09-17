import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Lütfen alanları kontrol edin.",
        details: error.flatten(),
      },
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message },
    });
    return;
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    res.status(409).json({
      success: false,
      error: { code: "CONFLICT", message: "Bu kayıt zaten mevcut." },
    });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_JSON", message: "Geçersiz JSON." },
    });
    return;
  }
  console.error(
    error instanceof Error ? error.message : "Unknown server error",
  );
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "İşlem tamamlanamadı. Lütfen tekrar deneyin.",
    },
  });
};
