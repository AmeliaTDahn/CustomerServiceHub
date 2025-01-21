import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Get environment variables with fallbacks and validation
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase credentials. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

// Initialize Supabase client with proper typing
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Define database types
export type Profile = Database['public']['Tables']['profiles']['Row'];

// Helper functions for profile management
export async function updateProfile({
  displayName,
  bio,
  jobTitle,
  location,
  phoneNumber
}: {
  displayName?: string;
  bio?: string;
  jobTitle?: string;
  location?: string;
  phoneNumber?: string;
}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        bio,
        job_title: jobTitle,
        location,
        phone_number: phoneNumber,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
}

export async function getProfile(userId: string) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data as Profile;
  } catch (error) {
    console.error('Error fetching profile:', error);
    throw error;
  }
}