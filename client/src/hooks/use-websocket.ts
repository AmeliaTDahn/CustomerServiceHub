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
  id?: number;
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
  const hasShownErrorRef = useRef(false);
  const isReconnectingRef = useRef(false);

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
    if (!userId || !wsRef.current?.readyState === WebSocket.OPEN) return;

    wsRef.current.send(JSON.stringify({
      type: 'pong',
      senderId: userId,
      timestamp: new Date().toISOString()
    }));
  }, [userId]);

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
          if (!isReconnectingRef.current) {
            ws.close();
          }
        }, 45000);
      };

      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          heartbeat();
          ws.send(JSON.stringify({
            type: 'ping',
            senderId: userId,
            timestamp: new Date().toISOString()
          }));
        }
      }, 15000);

      heartbeat();
    };

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;
      hasShownErrorRef.current = false;
      isReconnectingRef.current = false;
      setupPing();

      // Send initial connection message with user ID
      ws.send(JSON.stringify({
        type: 'connection',
        senderId: userId,
        role: role,
        timestamp: new Date().toISOString()
      }));

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
        isReconnectingRef.current = true;
        const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
        reconnectAttempts.current++;
        setTimeout(connect, timeout);

        // Only show reconnection toast after multiple attempts
        if (reconnectAttempts.current > 2) {
          toast({
            title: "Reconnecting...",
            description: `Attempt ${reconnectAttempts.current}/${maxReconnectAttempts}`,
          });
        }
      } else if (!hasShownErrorRef.current) {
        isReconnectingRef.current = false;
        hasShownErrorRef.current = true;
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

        // Reset error flags on successful message
        hasShownErrorRef.current = false;
        isReconnectingRef.current = false;

        if (data.type === 'connection') {
          console.log('Connection status:', data.status);
          queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
          return;
        }

        if (data.type === 'ping') {
          handleHeartbeat();
          return;
        }

        if (data.error) {
          // Only show error toast for non-connection related errors
          // and when we're not in a reconnecting state
          if (!data.error.includes('connection') && !isReconnectingRef.current) {
            toast({
              variant: "destructive",
              title: "Error",
              description: data.error,
            });
          }
          return;
        }

        if (data.type === 'ticket_resolved') {
          queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
          queryClient.invalidateQueries({ 
            queryKey: ['/api/tickets', data.ticketId] 
          });

          if (role === 'customer') {
            showNotification(
              'Ticket Resolved',
              `Your ticket #${data.ticketId} has been resolved.`
            );
          }
          return;
        }

        if (data.type === 'status_update') {
          if (data.ticketId) {
            queryClient.invalidateQueries({ 
              queryKey: ['/api/tickets', data.ticketId, 'messages'] 
            });
          } else {
            queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
          }
          return;
        }

        if (data.type === 'message' || data.type === 'direct_message') {
          if (data.ticketId) {
            queryClient.invalidateQueries({ 
              queryKey: ['/api/tickets', data.ticketId, 'messages'] 
            });
          } else {
            queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
          }

          if (data.senderId !== userId && data.receiverId === userId) {
            const notificationTitle = `New Message`;
            const notificationBody = `${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}`;

            showNotification(notificationTitle, notificationBody);

            const deliveryConfirmation: StatusUpdate = {
              type: 'status_update',
              messageId: data.id!,
              status: 'delivered',
              timestamp: new Date().toISOString()
            };
            ws.send(JSON.stringify({
              ...deliveryConfirmation,
              senderId: userId
            }));
          }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // Only show the error toast if:
      // 1. We're not already reconnecting
      // 2. We haven't shown an error yet
      // 3. This is our first connection attempt
      if (!isReconnectingRef.current && 
          !hasShownErrorRef.current && 
          reconnectAttempts.current === 0) {
        hasShownErrorRef.current = true;
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: "Please check your internet connection.",
        });
      }
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
    if (!userId) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Ensure message has senderId
      const messageWithSenderId = {
        ...message,
        senderId: userId,
        timestamp: new Date().toISOString()
      };

      wsRef.current.send(JSON.stringify(messageWithSenderId));
      queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
    } else {
      console.error('WebSocket is not connected');
      if (!hasShownErrorRef.current && !isReconnectingRef.current) {
        hasShownErrorRef.current = true;
        toast({
          variant: "destructive",
          title: "Error",
          description: "Connection lost. Please try again.",
        });
      }
    }
  }, [userId, queryClient, toast]);

  const sendReadReceipt = useCallback((messageId: number) => {
    if (!userId || !wsRef.current?.readyState === WebSocket.OPEN) return;

    const readReceipt: StatusUpdate & { senderId: number } = {
      type: 'status_update',
      messageId,
      senderId: userId,
      status: 'read',
      timestamp: new Date().toISOString()
    };

    wsRef.current.send(JSON.stringify(readReceipt));
    queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
  }, [userId, queryClient]);

  return {
    isConnected,
    sendMessage,
    sendReadReceipt
  };
}