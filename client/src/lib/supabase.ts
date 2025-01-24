import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Tables = {
  messages: {
    id: number;
    content: string;
    sender_id: string;
    receiver_id: string | null;
    ticket_id: number | null;
    status: 'sending' | 'sent' | 'delivered' | 'read';
    chat_initiator: boolean;
    initiated_at: string | null;
    created_at: string;
    sent_at: string;
    delivered_at: string | null;
    read_at: string | null;
  };
  tickets: {
    id: number;
    title: string;
    description: string;
    status: 'open' | 'in_progress' | 'resolved';
    customer_id: string;
    business_id: number;
    claimed_by_id: string | null;
    category: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    created_at: string;
    updated_at: string;
  };
};