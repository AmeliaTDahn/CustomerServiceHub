import type { Express } from "express";
import { supabase } from "@db";

export function setupAuth(app: Express) {
  // Middleware to check authentication
  app.use(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return next();
    }

    try {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error) throw error;
      if (user) {
        req.user = {
          id: parseInt(user.id),
          username: user.email || '',
          role: user.user_metadata.role
        };
      }
    } catch (error) {
      console.error('Auth error:', error);
    }
    next();
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const { email, password, role, businessName } = req.body;

      const { data: existingUser, error: existingUserError } = await supabase
        .from('users')
        .select()
        .eq('email', email)
        .single();

      if (existingUserError) throw existingUserError;
      if (existingUser) {
        return res.status(400).send("Email already exists");
      }

      const { user, error: userError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: role,
            businessName: businessName
          }
        }
      });

      if (userError) throw userError;

      return res.json({
        message: "Registration successful",
        user: {
          id: user.id,
          username: user.email,
          role: user.user_metadata.role
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const { data: { user }, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) {
        return res.status(400).send(error.message);
      }
      return res.json({
        message: "Login successful",
        user: {
          id: user.id,
          username: user.email,
          role: user.user_metadata.role
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/logout", async (req, res) => {
    try {
      await supabase.auth.signOut();
      res.json({ message: "Logout successful" });
    } catch (error) {
      return res.status(500).send("Logout failed");
    }
  });

  app.get("/api/user", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).send("Not logged in");
    }
    try {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) return res.status(401).send("Not logged in");
      return res.json({
        id: parseInt(user.id),
        username: user.email || '',
        role: user.user_metadata.role
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      return res.status(500).send("Server error");
    }
  });
}