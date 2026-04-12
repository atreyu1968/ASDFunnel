import type { Request, Response, NextFunction } from "express";
import { activeSessions } from "../routes/auth";

const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/health",
  "/api/public/",
  "/api/capture/",
  "/api/confirmation/",
];

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!process.env.ADMIN_PASSWORD_HASH) {
    next();
    return;
  }

  const path = req.path;

  if (!path.startsWith("/api/") || PUBLIC_PREFIXES.some((p) => path.startsWith(p))) {
    next();
    return;
  }

  const token = req.cookies?.asd_session;
  if (token && activeSessions.has(token)) {
    next();
    return;
  }

  res.status(401).json({ error: "No autenticado" });
}
