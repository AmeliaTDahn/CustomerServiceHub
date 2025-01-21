import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase credentials. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set.');
}

export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);