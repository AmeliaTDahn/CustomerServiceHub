import { useEffect, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

interface Message {
  content: string;
  sender_id: string;
  receiver_id?: string;
  ticket_id?: number;
  status?: string;
  created_at: string;
}

export function useRealtime(userId: string | undefined, role: string | undefined) {
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;

    // Subscribe to relevant channels
    const channel = supabase.channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: role === 'customer' 
            ? `receiver_id=eq.${userId}` 
            : undefined
        },
        (payload) => {
          const message = payload.new as Message;

          // Handle ticket messages
          if (message.ticket_id) {
            queryClient.invalidateQueries({ 
              queryKey: ['/api/tickets', message.ticket_id, 'messages']
            });
          }

          // Handle direct messages
          if (message.receiver_id === userId) {
            queryClient.invalidateQueries({ 
              queryKey: ['/api/direct-messages', message.sender_id]
            });
          }
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          toast({
            title: "Connected",
            description: "Message connection established",
          });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          toast({
            variant: "destructive",
            title: "Connection Lost",
            description: "Attempting to reconnect...",
          });
          setIsConnected(false);
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [userId, role, queryClient, toast]);

  const sendMessage = useCallback(async (message: {
    content: string;
    senderId: string;
    receiverId?: string;
    ticketId?: number;
  }) => {
    if (!message.ticketId && !message.receiverId) {
      throw new Error('Invalid message target: Must specify either ticketId or receiverId');
    }
    try {
      const { error } = await supabase
        .from('messages')
        .insert([{
          content: message.content,
          sender_id: message.senderId,
          receiver_id: message.receiverId,
          ticket_id: message.ticketId,
          status: 'sent',
          created_at: new Date().toISOString()
        }]);

      if (error) throw error;

      // Invalidate relevant queries
      if (message.ticketId) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/tickets', message.ticketId, 'messages']
        });
      }
      if (message.receiverId) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/direct-messages', message.receiverId]
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message. Please try again.",
      });
      throw error;
    }
  }, [queryClient, toast]);

  return {
    isConnected,
    sendMessage
  };
}