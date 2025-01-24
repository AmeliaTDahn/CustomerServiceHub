
import { createClient } from '@supabase/supabase-js';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export type Tables = {
  users: {
    id: number;
    username: string;
    password: string;
    role: 'business' | 'customer' | 'employee';
    created_at: string;
  };
  business_profiles: {
    id: number;
    user_id: number;
    business_name: string;
    created_at: string;
    updated_at: string;
  };
  business_employees: {
    id: number;
    business_profile_id: number;
    employee_id: number;
    is_active: boolean;
    created_at: string;
  };
  tickets: {
    id: number;
    title: string;
    description: string;
    status: 'open' | 'in_progress' | 'resolved';
    customer_id: number;
    business_profile_id: number;
    claimed_by_id: number | null;
    created_at: string;
    updated_at: string;
  };
};
