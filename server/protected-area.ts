import "express-session";
import type { Express, Request, Response, NextFunction } from "express";
import { createHash, timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";

// The Employees and Expenses pages and the Special Needs players sit behind a second, shared
// password (PROTECTED_AREA_PASSWORD) on top of the one login. Entering it unlocks them for the
// current login session only, for a fixed window; logging out, the login session expiring or
// pressing "Lock" locks them again. Every check happens here on the server.

declare module "express-session" {
  interface SessionData {
    protectedAreaUnlockedUntil?: number;
  }
}

const DEFAULT_UNLOCK_MINUTES = 15;

// Set on every "locked" 403 so the client can tell it apart from other errors
export const PROTECTED_AREA_HEADER = "X-Protected-Area";
// Number of rows a list response left out because the protected area is locked
export const PROTECTED_AREA_HIDDEN_HEADER = "X-Protected-Area-Hidden";

function unlockMinutes(): number {
  const minutes = Number(process.env.PROTECTED_AREA_TIMEOUT_MINUTES);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_UNLOCK_MINUTES;
}

function configuredPassword(): string | undefined {
  return process.env.PROTECTED_AREA_PASSWORD || undefined;
}

function passwordMatches(supplied: string, expected: string): boolean {
  // Fixed-length digests: timingSafeEqual needs equal lengths and must not leak the password length
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function isProtectedAreaUnlocked(req: Request): boolean {
  const until = req.session?.protectedAreaUnlockedUntil;
  if (!until) return false;
  if (Date.now() >= until) {
    delete req.session.protectedAreaUnlockedUntil;
    return false;
  }
  return req.isAuthenticated();
}

export function lockProtectedArea(req: Request) {
  if (req.session) delete req.session.protectedAreaUnlockedUntil;
}

export function sendProtectedAreaLocked(res: Response) {
  res.setHeader(PROTECTED_AREA_HEADER, "locked");
  return res.status(403).json({
    code: "PROTECTED_AREA_LOCKED",
    message: "This information is password protected. Enter the password to continue.",
  });
}

export function requireProtectedArea(req: Request, res: Response, next: NextFunction) {
  if (!isProtectedAreaUnlocked(req)) return sendProtectedAreaLocked(res);
  next();
}

function statusOf(req: Request) {
  const unlocked = isProtectedAreaUnlocked(req);
  return {
    configured: !!configuredPassword(),
    unlocked,
    // Relative, so the client's countdown doesn't depend on its clock matching the server's
    expiresInMs: unlocked ? req.session.protectedAreaUnlockedUntil! - Date.now() : null,
    timeoutMinutes: unlockMinutes(),
  };
}

export function registerProtectedAreaRoutes(app: Express) {
  if (!configuredPassword()) {
    console.warn("WARNING: PROTECTED_AREA_PASSWORD is not set — the Employees and Expenses pages and Special Needs players cannot be unlocked until it is.");
  }

  // Brute-force guard; correct passwords don't count against the limit
  const unlockLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    message: { message: "Too many incorrect password attempts. Please wait 15 minutes and try again." },
  });

  app.get("/api/protected-area", (req, res) => {
    res.json(statusOf(req));
  });

  app.post("/api/protected-area/unlock", unlockLimiter, (req, res, next) => {
    const expected = configuredPassword();
    if (!expected) {
      return res.status(503).json({ message: "No password has been set up for the protected pages yet. Set PROTECTED_AREA_PASSWORD on the server." });
    }
    const supplied = req.body?.password;
    if (typeof supplied !== "string" || supplied.length > 1024 || !passwordMatches(supplied, expected)) {
      return res.status(401).json({ message: "Incorrect password. Please try again." });
    }
    req.session.protectedAreaUnlockedUntil = Date.now() + unlockMinutes() * 60 * 1000;
    req.session.save((err) => (err ? next(err) : res.json(statusOf(req))));
  });

  app.post("/api/protected-area/lock", (req, res) => {
    lockProtectedArea(req);
    res.json(statusOf(req));
  });
}
