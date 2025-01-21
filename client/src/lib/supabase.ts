import { createClient } from '@supabase/supabase-js';

interface SupabaseConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

async function getSupabaseConfig(): Promise<SupabaseConfig> {
  let retries = 0;
  const maxRetries = 3;

  const checkConfig = async (): Promise<SupabaseConfig> => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      const missingVars = [];
      if (!supabaseUrl) missingVars.push('VITE_SUPABASE_URL');
      if (!supabaseKey) missingVars.push('VITE_SUPABASE_ANON_KEY');

      if (retries < maxRetries) {
        retries++;
        console.warn(`Retrying to get Supabase credentials (attempt ${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return checkConfig();
      }

      throw new Error(
        `Missing Supabase credentials after ${maxRetries} attempts: ${missingVars.join(', ')}. ` +
        'Make sure these environment variables are set.'
      );
    }

    return { supabaseUrl, supabaseKey };
  };

  return checkConfig();
}

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export async function getSupabase() {
  if (!supabaseInstance) {
    try {
      const config = await getSupabaseConfig();
      supabaseInstance = createClient(config.supabaseUrl, config.supabaseKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        }
      });
    } catch (error) {
      console.error('Failed to initialize Supabase client:', error);
      throw error;
    }
  }
  return supabaseInstance;
}

// Initialize supabase client
export const supabase = await getSupabase();