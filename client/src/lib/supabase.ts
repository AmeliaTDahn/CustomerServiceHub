import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public'
  },
  auth: {
    persistSession: true
  }
});

// Helper function to get messages between two users
export async function getMessages(userId1: number, userId2: number) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${userId1},sender_id.eq.${userId2}`)
    .or(`receiver_id.eq.${userId1},receiver_id.eq.${userId2}`)
    .order('created_at');

  if (error) {
    console.error('Error fetching messages:', error);
    throw new Error(error.message);
  }

  return data || [];
}

// Helper function to send a message
export async function sendMessage(senderId: number, receiverId: number, content: string) {
  if (!senderId || !receiverId || !content.trim()) {
    throw new Error('Missing required message data');
  }

  const message = {
    sender_id: senderId,
    receiver_id: receiverId,
    content: content.trim(),
    created_at: new Date().toISOString()
  };

  console.log('Sending message:', message);

  const { data, error } = await supabase
    .from('messages')
    .insert([message])
    .select()
    .single();

  if (error) {
    console.error('Error sending message:', error);
    throw new Error(error.message);
  }

  return data;
}