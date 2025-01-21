import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';
import { db } from "@db";
import { messages } from "@db/schema";

interface Message {
  senderId: number;
  receiverId: number;
  content: string;
  timestamp: string;
}

// Store active connections
const connections = new Map<number, WebSocket>();

export function setupWebSocket(server: Server, app: Express) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, userId: number) => {
    console.log(`New connection for user ${userId}`);
    connections.set(userId, ws);

    // Handle incoming messages
    ws.on('message', async (data: string) => {
      try {
        const message: Message = JSON.parse(data);
        console.log(`Received message:`, message);

        // Save message to database
        const [savedMessage] = await db.insert(messages)
          .values({
            content: message.content,
            senderId: message.senderId,
            receiverId: message.receiverId,
            createdAt: new Date(message.timestamp)
          })
          .returning();

        // Forward message to receiver if online
        const receiverWs = connections.get(message.receiverId);
        if (receiverWs?.readyState === WebSocket.OPEN) {
          receiverWs.send(JSON.stringify(savedMessage));
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    // Handle connection close
    ws.on('close', () => {
      console.log(`User ${userId} disconnected`);
      connections.delete(userId);
    });
  });

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    // Skip vite HMR requests
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    try {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const userId = parseInt(url.searchParams.get('userId') || '');

      if (!userId) {
        console.error('Invalid WebSocket connection parameters:', { userId });
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, userId);
      });
    } catch (error) {
      console.error('Error handling WebSocket upgrade:', error);
      socket.destroy();
    }
  });
}