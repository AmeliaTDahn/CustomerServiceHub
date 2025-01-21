import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase credentials. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set.');
}

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

export type Profile = {
  id: string;
  username: string;
  role: 'business' | 'customer' | 'employee';
  display_name?: string;
  bio?: string;
  job_title?: string;
  location?: string;
  phone_number?: string;
  created_at: string;
  updated_at: string;
};