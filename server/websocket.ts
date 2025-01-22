import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';
import { db } from "@db";
import { messages } from "@db/schema";
import { eq } from "drizzle-orm";

interface ExtendedWebSocket extends WebSocket {
  userId?: number;
  role?: string;
  isAlive?: boolean;
}

interface Message {
  type: string;
  content: string;
  senderId: number;
  receiverId: number;
}

const connections = new Map<number, ExtendedWebSocket>();

export function setupWebSocket(server: Server, app: Express) {
  const wss = new WebSocketServer({ noServer: true });

  // Heartbeat check every 30 seconds
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: ExtendedWebSocket) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.send(JSON.stringify({ type: 'ping' }));
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', (ws: ExtendedWebSocket, userId: number, role: string) => {
    console.log(`New WebSocket connection for ${role} user ${userId}`);

    ws.userId = userId;
    ws.role = role;
    ws.isAlive = true;
    connections.set(userId, ws);

    // Handle pong messages for heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data) as Message;

        if (message.type === 'ping') {
          ws.isAlive = true;
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (message.type === 'message') {
          // Validate sender
          if (message.senderId !== userId) {
            throw new Error('Invalid sender ID');
          }

          // Save message to database
          const [savedMessage] = await db.insert(messages)
            .values({
              content: message.content,
              senderId: message.senderId,
              receiverId: message.receiverId,
              createdAt: new Date()
            })
            .returning();

          // Create response message
          const responseMessage = {
            type: 'message',
            id: savedMessage.id,
            content: savedMessage.content,
            senderId: savedMessage.senderId,
            receiverId: savedMessage.receiverId,
            createdAt: savedMessage.createdAt.toISOString()
          };

          // Send confirmation to sender
          ws.send(JSON.stringify(responseMessage));

          // Forward message to receiver if online
          const receiverWs = connections.get(message.receiverId);
          if (receiverWs?.readyState === WebSocket.OPEN) {
            receiverWs.send(JSON.stringify(responseMessage));
          }
        }
      } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: (error as Error).message
        }));
      }
    });

    ws.on('close', () => {
      ws.isAlive = false;
      connections.delete(userId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for user ${userId}:`, error);
      ws.isAlive = false;
      connections.delete(userId);
    });

    // Send initial connection success message
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      userId: userId,
      role: role
    }));
  });

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    try {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const userId = parseInt(url.searchParams.get('userId') || '');
      const role = url.searchParams.get('role') || '';

      if (!userId || isNaN(userId) || !role || !['business', 'customer', 'employee'].includes(role)) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, userId, role);
      });
    } catch (error) {
      console.error('Error handling WebSocket upgrade:', error);
      socket.destroy();
    }
  });
}