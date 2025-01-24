import { Server } from 'http';
import { supabase } from '@db';
import { WebSocket, WebSocketServer } from 'ws';
import type { Express } from 'express';
import type { Tables } from "@/lib/supabase";

interface DirectMessage {
  type: 'direct_message';
  senderId: number;
  receiverId: number;
  content: string;
  timestamp: string;
  businessId?: number;
}

interface Message {
  type: string;
  senderId: number;
  receiverId?: number;
  content: string;
  timestamp: string;
  messageId?: number;
  ticketId?: number;
  chatInitiator?: boolean;
}

interface StatusUpdate {
  type: string;
  messageId: number;
  status: 'delivered' | 'read';
  timestamp: string;
}

interface ExtendedWebSocket extends WebSocket {
  userId?: number;
  role?: string;
  isAlive: boolean;
}

const connections = new Map<string, ExtendedWebSocket>();

async function determineUserRole(userId: number): Promise<string | null> {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (error) throw error;
    if (user) {
      console.log(`User ${userId} role found:`, user.role);
      return user.role;
    }

    const { data: customer, error: customerError } = await supabase
      .from('tickets')
      .select()
      .eq('customer_id', userId)
      .limit(1);

    if (customerError) throw customerError;
    if (customer && customer.length > 0) {
      console.log(`User ${userId} is a customer`);
      return 'customer';
    }

    console.error(`No role found for user ${userId}`);
    return null;
  } catch (error) {
    console.error('Error determining user role:', error);
    return null;
  }
}

export function setupWebSocket(server: Server) {
  // Subscribe to realtime changes for messages
  const messageSubscription = supabase
    .channel('messages')
    .on('INSERT', payload => {
      // Handle new messages
      console.log('New message:', payload);
    })
    .subscribe();

  // Subscribe to realtime changes for tickets
  const ticketSubscription = supabase
    .channel('tickets')
    .on('UPDATE', payload => {
      // Handle ticket updates
      console.log('Ticket updated:', payload);
    })
    .subscribe();

  server.on('close', () => {
    messageSubscription.unsubscribe();
    ticketSubscription.unsubscribe();
  });
}