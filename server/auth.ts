import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { supabase } from "@/lib/supabase";

export function setupAuth(app: Express) {
  const MemoryStore = createMemoryStore(session);
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID || "support-ticket-system",
    resave: false,
    saveUninitialized: false,
    cookie: {},
    store: new MemoryStore({
      checkPeriod: 86400000,
    }),
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie = {
      secure: true,
    };
  }

  app.use(session(sessionSettings));

  app.post("/api/register", async (req, res) => {
    try {
      const { email, password, role } = req.body;

      if (!email || !password || !role) {
        return res.status(400).send("Email, password, and role are required");
      }

      // Create user in Supabase with custom user metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: role,
          }
        }
      });

      if (authError) {
        console.error('Registration error:', authError);
        return res.status(400).json({ error: authError.message });
      }

      // Set session
      req.session.user = {
        id: authData.user?.id,
        email: authData.user?.email,
        role: authData.user?.user_metadata?.role,
      };

      return res.json({
        message: "Registration successful",
        user: {
          id: authData.user?.id,
          email: authData.user?.email,
          role: authData.user?.user_metadata?.role,
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).send("Email and password are required");
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.error('Login error:', authError);
        return res.status(400).json({ error: authError.message });
      }

      // Set session
      req.session.user = {
        id: authData.user?.id,
        email: authData.user?.email,
        role: authData.user?.user_metadata?.role,
      };

      return res.json({
        message: "Login successful",
        user: {
          id: authData.user?.id,
          email: authData.user?.email,
          role: authData.user?.user_metadata?.role,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/logout", async (req, res) => {
    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        console.error('Logout error:', signOutError);
        return res.status(500).json({ error: signOutError.message });
      }

      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
          return res.status(500).json({ error: "Logout failed" });
        }
        res.json({ message: "Logout successful" });
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  app.get("/api/user", async (req, res) => {
    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError) {
        return res.status(401).json({ error: authError.message });
      }

      if (!session) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      res.json({
        id: session.user.id,
        email: session.user.email,
        role: session.user.user_metadata.role,
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ error: "Failed to get user information" });
    }
  });
}