import type { Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { supabase } from "@db/index";

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: number;
      username: string;
      role: 'business' | 'customer' | 'employee';
    };
  }
}

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "porygon-supremacy",
    resave: false,
    saveUninitialized: false,
    cookie: {},
    store: new MemoryStore({
      checkPeriod: 86400000
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie = { secure: true };
  }

  app.use(session(sessionSettings));

  app.use(async (req, res, next) => {
    if (!req.session?.user) {
      return next();
    }

    try {
      const { data: user, error } = await supabase
        .from('users')
        .select()
        .eq('id', req.session.user.id)
        .single();

      if (user) {
        req.user = user;
      }
    } catch (error) {
      console.error('Auth error:', error);
    }
    next();
  });

  app.post("/api/register", async (req, res) => {
    try {
      const { username, password, role } = req.body;

      if (!username || !password || !role) {
        return res.status(400).send("Username, password and role are required");
      }

      const { data: existingUser } = await supabase
        .from('users')
        .select()
        .eq('username', username)
        .single();

      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      const { data: newUser, error } = await supabase
        .from('users')
        .insert([{
          username,
          password,
          role,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;

      req.session.user = {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role
      };

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          resolve();
        });
      });

      return res.json({
        message: "Registration successful",
        user: {
          id: newUser.id,
          username: newUser.username,
          role: newUser.role
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(500).send("Registration failed");
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { username, password, role } = req.body;

      if (!username || !password) {
        return res.status(400).send("Username and password are required");
      }

      const { data: user, error } = await supabase
        .from('users')
        .select()
        .eq('username', username)
        .single();

      if (!user) {
        return res.status(400).send("User not found");
      }

      if (user.password !== password) {
        return res.status(400).send("Invalid password");
      }

      if (role && user.role !== role) {
        return res.status(400).send(`Invalid role for user. Expected ${user.role}, got ${role}`);
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
      };

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          resolve();
        });
      });

      return res.json({
        message: "Login successful",
        user: {
          id: user.id,
          username: user.username,
          role: user.role
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).send("Login failed");
    }
  });

  app.post("/api/logout", async (req, res) => {
    try {
      req.session.destroy((err) => {
        if (err) {
          console.error('Logout error:', err);
          return res.status(500).send("Logout failed");
        }
        res.json({ message: "Logout successful" });
      });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).send("Logout failed");
    }
  });

  app.get("/api/user", async (req, res) => {
    if (req.session?.user) {
      return res.json(req.session.user);
    }
    res.status(401).send("Not logged in");
  });
}