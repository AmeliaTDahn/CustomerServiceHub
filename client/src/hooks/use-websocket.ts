import { useEffect, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

export function useWebSocket(userId: number | undefined, role: string | undefined) {
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

    const messagesChannel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          if (payload.new) {
            const message = payload.new;
            if (message.receiver_id === userId) {
              queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });

              if (hasNotificationPermission && document.hidden) {
                new Notification('New Message', {
                  body: message.content.substring(0, 50) + (message.content.length > 50 ? '...' : ''),
                  icon: '/notification-icon.png'
                });
              }
            }
          }
        }
      )
      .subscribe(() => setIsConnected(true));

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
          if (payload.new) {
            queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
            if (role === 'customer' && payload.new.status === 'resolved') {
              if (hasNotificationPermission && document.hidden) {
                new Notification('Ticket Resolved', {
                  body: `Your ticket #${payload.new.id} has been resolved.`,
                  icon: '/notification-icon.png'
                });
              }
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
    receiverId: number;
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
      queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
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