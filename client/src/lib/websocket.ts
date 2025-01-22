
import type { Toast } from "@/hooks/use-toast";

interface Message {
  type: string;
  senderId: number;
  receiverId: number;
  content: string;
  timestamp: string;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout = 1000;
  private messageCallbacks: ((message: any) => void)[] = [];
  private presenceCallbacks: ((data: any) => void)[] = [];
  private typingCallbacks: ((data: any) => void)[] = [];
  private toast: Toast;
  private userId: number;
  private tabId: string;
  private pingInterval: NodeJS.Timer | null = null;

  constructor(userId: number, toast: Toast) {
    this.userId = userId;
    this.toast = toast;
    this.tabId = crypto.randomUUID();
    this.connect();
  }

  private connect() {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?userId=${this.userId}&tabId=${this.tabId}`;

      console.log('Connecting to WebSocket:', wsUrl);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.handleError(error);
    }
  }

  private handleOpen() {
    console.log('WebSocket connected');
    this.reconnectAttempts = 0;
    this.reconnectTimeout = 1000;
    
    // Setup ping interval
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private handleMessage(event: MessageEvent) {
    try {
      const message = JSON.parse(event.data);
      console.log('Received message:', message);

      switch (message.type) {
        case 'connection':
          this.toast({
            title: "Connected",
            description: "Successfully connected to messaging service",
          });
          break;
        case 'message':
          this.messageCallbacks.forEach(callback => callback(message));
          break;
        case 'typing':
          this.typingCallbacks.forEach(callback => callback(message));
          break;
        case 'presence':
          this.presenceCallbacks.forEach(callback => callback(message));
          break;
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  private handleClose() {
    console.log('WebSocket closed');
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.handleReconnection();
  }

  private handleError(error: any) {
    console.error('WebSocket error:', error);
    this.toast({
      variant: "destructive",
      title: "Connection Error",
      description: "Lost connection to the messaging server. Attempting to reconnect...",
    });
  }

  private handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

      setTimeout(() => {
        this.connect();
      }, this.reconnectTimeout);

      // Exponential backoff
      this.reconnectTimeout *= 2;
    } else {
      this.toast({
        variant: "destructive",
        title: "Connection Failed",
        description: "Could not connect to the messaging server. Please refresh the page.",
      });
    }
  }

  public sendMessage(receiverId: number, content: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const message = {
      type: 'message',
      senderId: this.userId,
      receiverId,
      content,
      timestamp: new Date().toISOString(),
    };

    console.log('Sending message:', message);
    this.ws.send(JSON.stringify(message));
  }

  public sendTyping(receiverId: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'typing',
        senderId: this.userId,
        receiverId
      }));
    }
  }

  public onMessage(callback: (message: any) => void) {
    this.messageCallbacks.push(callback);
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter(cb => cb !== callback);
    };
  }

  public onTyping(callback: (data: any) => void) {
    this.typingCallbacks.push(callback);
    return () => {
      this.typingCallbacks = this.typingCallbacks.filter(cb => cb !== callback);
    };
  }

  public onPresence(callback: (data: any) => void) {
    this.presenceCallbacks.push(callback);
    return () => {
      this.presenceCallbacks = this.presenceCallbacks.filter(cb => cb !== callback);
    };
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

let wsClient: WebSocketClient | null = null;

export function initializeWebSocket(userId: number, toast: Toast) {
  if (!wsClient) {
    wsClient = new WebSocketClient(userId, toast);
  }
  return wsClient;
}

export function getWebSocketClient() {
  if (!wsClient) {
    throw new Error('WebSocket client not initialized');
  }
  return wsClient;
}
