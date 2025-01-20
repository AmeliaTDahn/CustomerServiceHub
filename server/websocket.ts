import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';

interface ChatMessage {
  ticketId: number;
  sender: string;
  content: string;
  timestamp: string;
}

// Store active connections
const connections = new Map<number, { 
  business?: WebSocket,
  customer?: WebSocket 
}>();

export function setupWebSocket(server: Server, app: Express) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, ticketId: number, role: 'business' | 'customer') => {
    // Initialize ticket connections if not exists
    if (!connections.has(ticketId)) {
      connections.set(ticketId, {});
    }
    
    const ticketConnections = connections.get(ticketId)!;
    ticketConnections[role] = ws;

    // Handle incoming messages
    ws.on('message', (data: string) => {
      const message: ChatMessage = JSON.parse(data);
      
      // Forward message to the other party
      const otherRole = role === 'business' ? 'customer' : 'business';
      const otherConnection = ticketConnections[otherRole];
      
      if (otherConnection?.readyState === WebSocket.OPEN) {
        otherConnection.send(JSON.stringify(message));
      }
    });

    // Handle connection close
    ws.on('close', () => {
      if (connections.has(ticketId)) {
        const ticketConnections = connections.get(ticketId)!;
        ticketConnections[role] = undefined;
        
        // Remove ticket entry if no active connections
        if (!ticketConnections.business && !ticketConnections.customer) {
          connections.delete(ticketId);
        }
      }
    });
  });

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    // Skip vite HMR requests
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    const url = new URL(request.url!, `http://${request.headers.host}`);
    const ticketId = parseInt(url.searchParams.get('ticketId') || '');
    const role = url.searchParams.get('role') as 'business' | 'customer';

    if (!ticketId || !role || !['business', 'customer'].includes(role)) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, ticketId, role);
    });
  });
}
