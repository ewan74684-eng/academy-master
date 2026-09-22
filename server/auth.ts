import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, users } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

declare global {
  namespace Express {
    interface User extends SelectUser { }
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  // timingSafeEqual throws on length mismatch (e.g. a malformed stored hash)
  if (hashedBuf.length !== suppliedBuf.length) return false;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function requireRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    if (!req.user || !roles.includes((req.user as any).role)) {
      return res.status(403).json({ message: "Forbidden: insufficient permissions" });
    }
    next();
  };
}

export async function setupAuth(app: Express) {
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

  try {
    if (!ADMIN_USERNAME || !ADMIN_PASSWORD) throw new Error("ADMIN_USERNAME / ADMIN_PASSWORD are not set; skipping admin seed");
    const existingAdmins = await db.select().from(users).where(eq(users.username, ADMIN_USERNAME));
    if (existingAdmins.length === 0) {
      const hashed = await hashPassword(ADMIN_PASSWORD);
      await db.insert(users).values({ username: ADMIN_USERNAME, password: hashed, role: 'admin' });
      console.log("Seeded default admin user");
    }
  } catch (err) {
    console.error("Failed to seed admin user:", err);
  }

  if (!process.env.SESSION_SECRET) {
    console.warn("WARNING: SESSION_SECRET is not set — using a built-in default. Set a long random SESSION_SECRET in the environment.");
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "academy-flow-secret",
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({
      checkPeriod: 86400000,
    }),
    cookie: {
      maxAge: 86400000, // 24 hours
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax", // blocks the session cookie on cross-site POSTs (CSRF)
    },
  };

  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        if (typeof username !== "string" || typeof password !== "string" || username.length > 255 || password.length > 1024) {
          return done(null, false, { message: "Invalid username or password" });
        }
        const [user] = await db.select().from(users).where(eq(users.username, username));
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user as Express.User);
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) return done(null, false);
      done(null, user as Express.User);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Login failed" });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        return res.json({ message: "Logged in successfully", user: { id: user.id, username: user.username, role: (user as any).role } });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/user", (req, res) => {
    if (req.isAuthenticated()) {
      return res.json({ id: req.user.id, username: req.user.username, role: (req.user as any).role });
    }
    res.status(401).json({ message: "Not authenticated" });
  });
}
