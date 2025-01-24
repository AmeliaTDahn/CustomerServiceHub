import type { Express } from "express";
import { db } from "@db/index";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";

export function setupAuth(app: Express) {
  // Middleware to check authentication
  app.use(async (req, res, next) => {
    if (!req.session?.user) {
      return next();
    }

    try {
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.session.user.id))
        .limit(1);

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

      // Check if user already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (existingUser) {
        return res.status(400).send("Username already exists");
      }

      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password, // Note: In production, you should hash the password
          role,
          createdAt: new Date()
        })
        .returning();

      // Set session
      req.session.user = newUser;
      await req.session.save();

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

      // Find user
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (!user) {
        return res.status(400).send("User not found");
      }

      // In production, you should compare hashed passwords
      if (user.password !== password) {
        return res.status(400).send("Invalid password");
      }

      if (role && user.role !== role) {
        return res.status(400).send(`Invalid role for user. Expected ${user.role}, got ${role}`);
      }

      // Set session
      req.session.user = user;
      await req.session.save();

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
      req.session.destroy(() => {
        res.json({ message: "Logout successful" });
      });
    } catch (error) {
      console.error('Logout error:', error);
      return res.status(500).send("Logout failed");
    }
  });

  app.get("/api/user", async (req, res) => {
    if (req.user) {
      return res.json({
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      });
    }

    res.status(401).send("Not logged in");
  });
}