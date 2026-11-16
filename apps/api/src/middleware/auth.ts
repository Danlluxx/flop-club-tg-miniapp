import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { User } from "@prisma/client";
import { config, isAdminTelegramUsername } from "../config.js";
import { prisma } from "../prisma.js";
import { AppError } from "../utils/errors.js";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export type JwtPayload = { userId: string };

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw new AppError(401, "Authorization token required", "TOKEN_REQUIRED");

    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new AppError(401, "User not found", "USER_NOT_FOUND");

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN" || !isAdminTelegramUsername(req.user.username)) {
    next(new AppError(403, "Admin access required", "ADMIN_REQUIRED"));
    return;
  }
  next();
}

// Revenue is for the club owner and the accounts they trust: other admins run tournaments but must not see the money.
// Salary data (the payroll table, rates, pay per employee) stays with the owner alone.
const ANALYTICS_OWNER_USERNAME = "danlluxx";
const ANALYTICS_VIEWER_USERNAMES = new Set([ANALYTICS_OWNER_USERNAME, "rrrrrr55555588"]);

const normalizeUsername = (username?: string | null) => username?.trim().replace(/^@/, "").toLowerCase() ?? "";

export function isAnalyticsOwner(username?: string | null) {
  return normalizeUsername(username) === ANALYTICS_OWNER_USERNAME;
}

export function isAnalyticsViewer(username?: string | null) {
  return ANALYTICS_VIEWER_USERNAMES.has(normalizeUsername(username));
}

export function requireAnalyticsViewer(req: Request, _res: Response, next: NextFunction) {
  if (!isAnalyticsViewer(req.user?.username)) {
    next(new AppError(403, "Analytics access required", "ANALYTICS_ACCESS_REQUIRED"));
    return;
  }
  next();
}

export function requireAnalyticsOwner(req: Request, _res: Response, next: NextFunction) {
  if (!isAnalyticsOwner(req.user?.username)) {
    next(new AppError(403, "Analytics access required", "ANALYTICS_ACCESS_REQUIRED"));
    return;
  }
  next();
}
