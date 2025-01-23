import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface Message {
  type: string;
  senderId: number;
  receiverId: number;
  content: string;
  timestamp: string;
  ticketId?: number;
  directMessageUserId?: number;
  chatInitiator?: boolean;
  id?: number; // Added id property for message
}

interface StatusUpdate {
  type: 'status_update';
  messageId: number;
  status: 'delivered' | 'read';
  timestamp: string;
}

interface TicketResolution {
  type: 'ticket_resolved';
  ticketId: number;
  resolvedBy: number;
  timestamp: string;
}

export function useWebSocket(userId: number | undefined, role: string | undefined) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const pingInterval = useRef<ReturnType<typeof setInterval>>();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Request notification permission
  useEffect(() => {
    async function requestPermission() {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        setHasNotificationPermission(permission === 'granted');
      }
    }
    requestPermission();
  }, []);

  // Invalidate direct messages queries on mount
  useEffect(() => {
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
    }
  }, [userId, queryClient]);

  const showNotification = useCallback((title: string, body: string) => {
    if (hasNotificationPermission && document.hidden) {
      new Notification(title, {
        body,
        icon: '/notification-icon.png',
      });
    }
  }, [hasNotificationPermission]);

  const handleHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'pong' }));
    }
  }, []);

  const connect = useCallback(() => {
    if (!userId || !role) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}?userId=${userId}&role=${role}`);

    const setupPing = () => {
      if (pingInterval.current) {
        clearInterval(pingInterval.current);
      }
      let pingTimeout: ReturnType<typeof setTimeout>;

      const heartbeat = () => {
        clearTimeout(pingTimeout);
        pingTimeout = setTimeout(() => {
          ws.close();
        }, 45000);
      };

      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          heartbeat();
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15000);

      heartbeat(); // Initial heartbeat
    };

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;
      setupPing();

      // Initial message queries invalidation
      queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      wsRef.current = null;

      if (pingInterval.current) {
        clearInterval(pingInterval.current);
      }

      if (reconnectAttempts.current < maxReconnectAttempts) {
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
        reconnectAttempts.current++;
        setTimeout(connect, timeout);

        toast({
          title: "Disconnected",
          description: `Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})...`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Connection Failed",
          description: "Please refresh the page to try again.",
        });
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connection') {
          console.log('Connection status:', data.status);
          // Invalidate message queries on successful connection
          queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
          return;
        }

        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        if (data.type === 'pong') {
          handleHeartbeat();
          return;
        }

        if (data.error) {
          toast({
            variant: "destructive",
            title: "Error",
            description: data.error,
          });
          return;
        }

        if (data.type === 'ticket_resolved') {
          // Invalidate tickets query to refresh the list
          queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
          queryClient.invalidateQueries({ 
            queryKey: ['/api/tickets', data.ticketId] 
          });

          // Show notification for ticket resolution
          if (role === 'customer') {
            showNotification(
              'Ticket Resolved',
              `Your ticket #${data.ticketId} has been resolved.`
            );
          }
          return;
        }

        if (data.type === 'status_update') {
          // Invalidate queries for both direct messages and ticket messages
          if (data.ticketId) {
            queryClient.invalidateQueries({ 
              queryKey: ['/api/tickets', data.ticketId, 'messages'] 
            });
          } else {
            // Invalidate all direct messages queries to ensure proper refresh
            queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
          }
          return;
        }

        if (data.type === 'message' || data.type === 'direct_message') {
          // Invalidate the appropriate queries based on message type
          if (data.ticketId) {
            queryClient.invalidateQueries({ 
              queryKey: ['/api/tickets', data.ticketId, 'messages'] 
            });
          } else {
            // Invalidate all direct messages queries
            queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
          }

          // Only show notification for messages received from other users
          if (data.senderId !== userId && data.receiverId === userId) {
            const notificationTitle = `New Message`;
            const notificationBody = `${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}`;

            showNotification(notificationTitle, notificationBody);

            // Send delivery confirmation
            const deliveryConfirmation: StatusUpdate = {
              type: 'status_update',
              messageId: data.id,
              status: 'delivered',
              timestamp: new Date().toISOString()
            };
            ws.send(JSON.stringify(deliveryConfirmation));
          }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Please check your internet connection.",
      });
    };

    wsRef.current = ws;
  }, [userId, role, queryClient, toast, showNotification, handleHeartbeat]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (pingInterval.current) {
        clearInterval(pingInterval.current);
      }
    };
  }, [connect]);

  const sendMessage = useCallback((message: Message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      // Immediately invalidate queries to ensure fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
    } else {
      console.error('WebSocket is not connected');
      toast({
        variant: "destructive",
        title: "Error",
        description: "Connection lost. Please try again.",
      });
    }
  }, [queryClient, toast]);

  const sendReadReceipt = useCallback((messageId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const readReceipt: StatusUpdate = {
        type: 'status_update',
        messageId,
        status: 'read',
        timestamp: new Date().toISOString()
      };
      wsRef.current.send(JSON.stringify(readReceipt));
      // Immediately invalidate queries after sending read receipt
      queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
    }
  }, [queryClient]);

  return {
    isConnected,
    sendMessage,
    sendReadReceipt
  };
}