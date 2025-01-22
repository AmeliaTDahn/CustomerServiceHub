import { useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface Message {
  type: string;
  senderId: number;
  receiverId: number;
  content: string;
  timestamp: string;
  id?: number;
  ticketId?: number;
}

interface StatusUpdate {
  type: 'status_update';
  messageId: number;
  status: 'delivered' | 'read';
  timestamp: string;
}

export function useWebSocket(userId: number | undefined, role: string | undefined) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const pingInterval = useRef<NodeJS.Timer>();
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

  // Show browser notification
  const showNotification = useCallback((title: string, body: string) => {
    if (hasNotificationPermission && document.hidden) {
      new Notification(title, {
        body,
        icon: '/notification-icon.png',
      });
    }
  }, [hasNotificationPermission]);

  const connect = useCallback(() => {
    if (!userId || !role) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}?userId=${userId}&role=${role}`);

    // Set up ping interval
    const setupPing = () => {
      // Clear any existing interval
      if (pingInterval.current) {
        clearInterval(pingInterval.current);
      }
      // Send ping every 15 seconds
      pingInterval.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 15000);
    };

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;
      setupPing();

      toast({
        title: "Connected",
        description: "Message connection established",
      });
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      wsRef.current = null;

      // Clear ping interval
      if (pingInterval.current) {
        clearInterval(pingInterval.current);
      }

      // Attempt to reconnect with exponential backoff
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

        // Handle connection status message
        if (data.type === 'connection') {
          console.log('Connection status:', data.status);
          return;
        }

        // Handle ping/pong messages
        if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        if (data.type === 'pong') {
          return;
        }

        // Handle error message
        if (data.error) {
          toast({
            variant: "destructive",
            title: "Error",
            description: data.error,
          });
          return;
        }

        // Handle status updates
        if (data.type === 'status_update') {
          const update = data as StatusUpdate;
          queryClient.invalidateQueries({ queryKey: ['messages'] });
          return;
        }

        if (data.type === 'message') {
          // Invalidate the messages query to update the UI
          queryClient.invalidateQueries({ queryKey: ['messages', data.senderId] });
          queryClient.invalidateQueries({ queryKey: ['/api/tickets', data.ticketId, 'messages'] });

          // Show notification for new messages if not from current user
          if (data.senderId !== userId) {
            const notificationTitle = `New Message`;
            const notificationBody = `You have received a new message: ${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}`;

            showNotification(notificationTitle, notificationBody);

            toast({
              title: notificationTitle,
              description: notificationBody,
            });
          }

          // Send delivery confirmation
          if (data.senderId !== userId) {
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
  }, [userId, role, queryClient, toast, showNotification]);

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
    } else {
      console.error('WebSocket is not connected');
      toast({
        variant: "destructive",
        title: "Error",
        description: "Connection lost. Please try again.",
      });
    }
  }, [toast]);

  const sendReadReceipt = useCallback((messageId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const readReceipt: StatusUpdate = {
        type: 'status_update',
        messageId,
        status: 'read',
        timestamp: new Date().toISOString()
      };
      wsRef.current.send(JSON.stringify(readReceipt));
    }
  }, []);

  return {
    isConnected,
    sendMessage,
    sendReadReceipt
  };
}