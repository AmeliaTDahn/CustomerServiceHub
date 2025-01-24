import { drizzle } from "drizzle-orm/postgres-js";
import { createClient } from '@supabase/supabase-js';
import postgres from "postgres";
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

// Create Supabase client for real-time features
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Create Postgres client for Drizzle ORM
const queryClient = postgres(process.env.DATABASE_URL);
export const db = drizzle(queryClient, { schema });