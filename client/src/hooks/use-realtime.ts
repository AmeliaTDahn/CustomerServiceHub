import { useEffect, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/supabase';

type Message = {
  id: number;
  content: string;
  sender_id: number;
  receiver_id?: number;
  ticket_id?: number;
  created_at: string;
  read_at?: string | null;
};

export function useRealtime(userId: number | undefined, role: string | undefined) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    async function requestPermission() {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        setHasNotificationPermission(permission === 'granted');
      }
    }
    requestPermission();
  }, []);

  useEffect(() => {
    if (!userId) return;

    // Subscribe to messages channel
    const messagesChannel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: role === 'customer' 
            ? `receiver_id=eq.${userId}` 
            : undefined
        },
        (payload) => {
          const message = payload.new as Message;

          // Handle different message scenarios
          if (message) {
            // For ticket messages
            if (message.ticket_id) {
              queryClient.invalidateQueries({ 
                queryKey: ['/api/tickets', message.ticket_id, 'messages']
              });
            }

            // For direct messages
            if (message.receiver_id === userId) {
              queryClient.invalidateQueries({ 
                queryKey: ['/api/messages/direct']
              });

              // Show notification if tab is not active
              if (hasNotificationPermission && document.hidden) {
                new Notification('New Message', {
                  body: message.content.substring(0, 50) + 
                    (message.content.length > 50 ? '...' : ''),
                  icon: '/notification-icon.png'
                });
              }
            }
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    // Subscribe to tickets channel for status updates
    const ticketsChannel = supabase
      .channel('tickets')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets'
        },
        (payload) => {
          const ticket = payload.new as Tables['tickets'];
          if (ticket) {
            queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });

            // Notify customer when their ticket is resolved
            if (role === 'customer' && 
                ticket.status === 'resolved' && 
                hasNotificationPermission && 
                document.hidden) {
              new Notification('Ticket Resolved', {
                body: `Your ticket #${ticket.id} has been resolved.`,
                icon: '/notification-icon.png'
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      messagesChannel.unsubscribe();
      ticketsChannel.unsubscribe();
    };
  }, [userId, role, queryClient, hasNotificationPermission]);

  const sendMessage = useCallback(async (message: {
    content: string;
    senderId: number;
    receiverId?: number;
    ticketId?: number;
  }) => {
    try {
      const { error } = await supabase.from('messages').insert([{
        content: message.content,
        sender_id: message.senderId,
        receiver_id: message.receiverId,
        ticket_id: message.ticketId,
        created_at: new Date().toISOString()
      }]);

      if (error) throw error;

      // Invalidate relevant queries based on message type
      if (message.ticketId) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/tickets', message.ticketId, 'messages']
        });
      }
      if (message.receiverId) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/messages/direct']
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message",
      });
    }
  }, [queryClient, toast]);

  return {
    isConnected,
    sendMessage
  };
}