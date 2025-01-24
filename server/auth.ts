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
      supabaseId: string;
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
      const { username, email, password, role } = req.body;

      if (!username || !email || !password || !role) {
        return res.status(400).send("Email, username, password and role are required");
      }

      // Create user in Supabase Auth using provided email
      const { data: authUser, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            role
          }
        }
      });

      if (authError) {
        console.error('Supabase Auth error:', authError);
        return res.status(400).send(authError.message);
      }

      if (!authUser.user) {
        return res.status(500).send("Failed to create auth user");
      }

      // Check if username already exists in our database
      const { data: existingUser } = await supabase
        .from('users')
        .select()
        .eq('username', username)
        .single();

      if (existingUser) {
        // Rollback the auth user creation
        await supabase.auth.admin.deleteUser(authUser.user.id);
        return res.status(400).send("Username already exists");
      }

      // Create the user record in our database
      const { data: newUser, error: dbError } = await supabase
        .from('users')
        .insert([{
          username,
          role,
          supabase_id: authUser.user.id,
          email: email,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (dbError) {
        // Rollback the auth user creation
        await supabase.auth.admin.deleteUser(authUser.user.id);
        throw dbError;
      }

      req.session.user = {
        id: newUser.id,
        username: newUser.username,
        role: newUser.role,
        supabaseId: authUser.user.id
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
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).send("Username and password are required");
      }

      // Authenticate with Supabase using username as email
      const email = `${username}@internal.local`;
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        return res.status(400).send(authError.message);
      }

      if (!authData.user) {
        return res.status(400).send("Invalid credentials");
      }

      // Get user from our database
      const { data: user, error: dbError } = await supabase
        .from('users')
        .select()
        .eq('supabase_id', authData.user.id)
        .single();

      if (dbError || !user) {
        return res.status(400).send("User not found");
      }

      if (role && user.role !== role) {
        return res.status(400).send(`Invalid role for user. Expected ${user.role}, got ${role}`);
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        supabaseId: authData.user.id
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
      // Sign out from Supabase
      await supabase.auth.signOut();

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