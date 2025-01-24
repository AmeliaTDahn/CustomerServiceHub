import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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