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
    console.log(`New ${role} connection for ticket ${ticketId}`);

    // Initialize ticket connections if not exists
    if (!connections.has(ticketId)) {
      connections.set(ticketId, {});
    }

    const ticketConnections = connections.get(ticketId)!;
    ticketConnections[role] = ws;

    // Handle incoming messages
    ws.on('message', (data: string) => {
      try {
        const message: ChatMessage = JSON.parse(data);
        console.log(`Received message for ticket ${ticketId}:`, message);

        // Forward message to the other party
        const otherRole = role === 'business' ? 'customer' : 'business';
        const otherConnection = ticketConnections[otherRole];

        if (otherConnection?.readyState === WebSocket.OPEN) {
          otherConnection.send(JSON.stringify(message));
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    // Handle connection close
    ws.on('close', () => {
      console.log(`${role} disconnected from ticket ${ticketId}`);
      if (connections.has(ticketId)) {
        const ticketConnections = connections.get(ticketId)!;
        ticketConnections[role] = undefined;

        // Remove ticket entry if no active connections
        if (!ticketConnections.business && !ticketConnections.customer) {
          connections.delete(ticketId);
        }
      }
    });

    // Send initial connection success message
    ws.send(JSON.stringify({
      ticketId,
      sender: 'system',
      content: `Connected to ticket ${ticketId} chat as ${role}`,
      timestamp: new Date().toISOString()
    }));
  });

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    // Skip vite HMR requests
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    try {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const ticketId = parseInt(url.searchParams.get('ticketId') || '');
      const role = url.searchParams.get('role') as 'business' | 'customer';

      if (!ticketId || !role || !['business', 'customer'].includes(role)) {
        console.error('Invalid WebSocket connection parameters:', { ticketId, role });
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, ticketId, role);
      });
    } catch (error) {
      console.error('Error handling WebSocket upgrade:', error);
      socket.destroy();
    }
  });
}