import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  console.error(`[${req.method}] ${req.path}`, error);

  if (error instanceof AppError) {
    res.status(error.statusCode).json({ message: error.message, code: error.code });
    return;
  }

  // body-parser errors (oversized or malformed JSON) carry their own 4xx status.
  const bodyError = error as { type?: string; status?: number };
  if (bodyError.type === "entity.too.large") {
    res.status(413).json({ message: "Файл слишком большой", code: "PAYLOAD_TOO_LARGE" });
    return;
  }
  if (bodyError.type === "entity.parse.failed") {
    res.status(400).json({ message: "Некорректный запрос", code: "BAD_JSON" });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ message: "Duplicate record", code: "DUPLICATE_RECORD" });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({ message: error.errors[0]?.message ?? "Invalid request", code: "VALIDATION_ERROR" });
    return;
  }

  res.status(500).json({ message: "Internal server error", code: "INTERNAL_SERVER_ERROR" });
}
