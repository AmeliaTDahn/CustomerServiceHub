import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase credentials. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set.');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Add username search route for businesses
  app.get("/api/users/search", async (req, res) => {
    if (!req.user || req.user.role !== "business") {
      return res.status(403).send("Only business accounts can search users");
    }

    const { username } = req.query;
    if (!username || typeof username !== "string") {
      return res.status(400).send("Username query parameter is required");
    }

    try {
      const { data: users, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, job_title, location')
        .or(`username.ilike.%${username}%, display_name.ilike.%${username}%`)
        .in('role', ['customer', 'employee'])
        .limit(10);

      if (error) throw error;
      res.json(users);
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).send("Failed to search users");
    }
  });


  const httpServer = createServer(app);
  setupWebSocket(httpServer, app);
  return httpServer;
}