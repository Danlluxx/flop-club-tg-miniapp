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
