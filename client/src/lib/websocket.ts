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
  private reconnectTimeout = 1000; // Start with 1 second
  private messageCallbacks: ((message: Message) => void)[] = [];
  private toast: Toast;
  private userId: number;
  private role: string;
  private connectionPromise: Promise<void> | null = null;
  private isConnecting = false;

  constructor(userId: number, role: string, toast: Toast) {
    this.userId = userId;
    this.role = role;
    this.toast = toast;
    this.connect();
  }

  private connect(): Promise<void> {
    if (this.isConnecting) {
      return this.connectionPromise!;
    }

    this.isConnecting = true;
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?userId=${this.userId}&role=${this.role}`;

        console.log('Connecting to WebSocket:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected successfully');
          this.reconnectAttempts = 0;
          this.reconnectTimeout = 1000;
          this.isConnecting = false;
          resolve();
        };

        this.ws.onmessage = this.handleMessage.bind(this);
        
        this.ws.onclose = () => {
          console.log('WebSocket connection closed');
          this.isConnecting = false;
          this.handleReconnection();
          reject(new Error('WebSocket connection closed'));
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.isConnecting = false;
          this.handleError(error);
          reject(error);
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        this.isConnecting = false;
        this.handleError(error);
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  private handleMessage(event: MessageEvent) {
    try {
      const message = JSON.parse(event.data);
      console.log('Received message:', message);

      // Handle connection messages
      if (message.type === 'connection') {
        this.toast({
          title: "Connected",
          description: "Successfully connected to messaging service",
        });
        return;
      }

      this.messageCallbacks.forEach(callback => callback(message));
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  private handleError(error: any) {
    console.error('WebSocket error:', error);
    this.toast({
      variant: "destructive",
      title: "Connection Error",
      description: "Lost connection to the messaging server. Attempting to reconnect...",
    });
  }

  private async handleReconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

      await new Promise(resolve => setTimeout(resolve, this.reconnectTimeout));
      
      // Exponential backoff
      this.reconnectTimeout *= 2;
      
      try {
        await this.connect();
      } catch (error) {
        console.error('Reconnection attempt failed:', error);
      }
    } else {
      this.toast({
        variant: "destructive",
        title: "Connection Failed",
        description: "Could not connect to the messaging server. Please refresh the page.",
      });
    }
  }

  public async sendMessage(receiverId: number, content: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.log('WebSocket not ready, attempting to connect...');
      try {
        await this.connect();
      } catch (error) {
        throw new Error('Failed to establish WebSocket connection');
      }
    }

    const message = {
      type: 'message',
      senderId: this.userId,
      receiverId,
      content,
      timestamp: new Date().toISOString(),
    };

    console.log('Sending message:', message);
    this.ws!.send(JSON.stringify(message));
  }

  public onMessage(callback: (message: Message) => void) {
    this.messageCallbacks.push(callback);
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter(cb => cb !== callback);
    };
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public async ensureConnection(): Promise<void> {
    if (!this.isConnected()) {
      await this.connect();
    }
  }
}

// Singleton instance
let wsClient: WebSocketClient | null = null;

export function initializeWebSocket(userId: number, role: string, toast: Toast) {
  if (!wsClient) {
    wsClient = new WebSocketClient(userId, role, toast);
  }
  return wsClient;
}

export function getWebSocketClient() {
  if (!wsClient) {
    throw new Error('WebSocket client not initialized');
  }
  return wsClient;
}
