import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Express } from "express";
import { storage } from "./storage";
import { pool } from "./db";

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
    }
  }
}

export function setupAuth(app: Express) {
  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        pool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "surfcast-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
      proxy: process.env.NODE_ENV === "production",
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || user.password !== password) {
          return done(null, false, { message: "Invalid credentials" });
        }
        return done(null, { id: user.id, username: user.username });
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) return done(null, false);
      done(null, { id: user.id, username: user.username });
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: info?.message || "Invalid credentials" });
      req.logIn(user, (err) => {
        if (err) return next(err);
        res.json({ id: user.id, username: user.username });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout(() => {
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    res.json({ id: req.user!.id, username: req.user!.username });
  });
}
