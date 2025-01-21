import { type Express } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase credentials. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set.');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

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

      // Create user in Supabase with email confirmation disabled
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: role,
            business_profile: role === 'business' ? {
              companyName: '',
              description: '',
            } : undefined
          },
          emailRedirectTo: `${process.env.VITE_PUBLIC_URL || ''}/auth/callback`
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

      // Create profile in Supabase
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user?.id,
          username: email,
          role: role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        return res.status(500).json({ error: "Failed to create profile" });
      }

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