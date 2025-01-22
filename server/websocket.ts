import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';
import { db } from "@db";
import { messages } from "@db/schema";
import crypto from 'crypto';

interface Client {
  ws: WebSocket;
  userId: number;
  tabId: string;
  lastPong: number;
}

const clients = new Map<string, Client>();
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 35000;

export function setupWebSocket(server: Server, app: Express) {
  const wss = new WebSocketServer({ noServer: true });

  // Heartbeat interval
  setInterval(() => {
    const now = Date.now();
    clients.forEach((client, key) => {
      if (now - client.lastPong > HEARTBEAT_TIMEOUT) {
        client.ws.terminate();
        clients.delete(key);
        return;
      }
      client.ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('connection', (ws: WebSocket, userId: number, tabId: string) => {
    const clientKey = `${userId}-${tabId}`;
    clients.set(clientKey, { ws, userId, tabId, lastPong: Date.now() });

    ws.on('pong', () => {
      const client = clients.get(clientKey);
      if (client) {
        client.lastPong = Date.now();
      }
    });

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data);
        console.log('Received message:', message);

        switch (message.type) {
          case 'message':
            await handleChatMessage(message);
            break;
          case 'typing':
            broadcastTyping(message);
            break;
          case 'presence':
            updatePresence(message);
            break;
          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({ 
          type: 'error',
          error: error instanceof Error ? error.message : 'Failed to process message' 
        }));
      }
    });

    ws.on('close', () => {
      clients.delete(clientKey);
      broadcastPresence(userId, 'offline');
    });

    // Send initial connection success
    ws.send(JSON.stringify({ 
      type: 'connection',
      status: 'connected',
      userId,
      tabId
    }));

    // Broadcast presence
    broadcastPresence(userId, 'online');
  });

  // Handle upgrade requests
  server.on('upgrade', (request, socket, head) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') return;

    try {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const userId = parseInt(url.searchParams.get('userId') || '');
      const tabId = url.searchParams.get('tabId') || crypto.randomUUID();

      if (!userId || isNaN(userId)) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, userId, tabId);
      });
    } catch (error) {
      console.error('Error handling WebSocket upgrade:', error);
      socket.destroy();
    }
  });

  async function handleChatMessage(message: any) {
    const [savedMessage] = await db.insert(messages)
      .values({
        content: message.content,
        senderId: message.senderId,
        receiverId: message.receiverId,
        createdAt: new Date()
      })
      .returning();

    broadcastMessage(savedMessage);
  }

  function broadcastMessage(message: any) {
    const messageStr = JSON.stringify({
      type: 'message',
      ...message
    });

    clients.forEach(client => {
      if (client.userId === message.senderId || client.userId === message.receiverId) {
        client.ws.send(messageStr);
      }
    });
  }

  function broadcastTyping(message: any) {
    clients.forEach(client => {
      if (client.userId === message.receiverId) {
        client.ws.send(JSON.stringify({
          type: 'typing',
          senderId: message.senderId
        }));
      }
    });
  }

  function broadcastPresence(userId: number, status: 'online' | 'offline') {
    const message = JSON.stringify({
      type: 'presence',
      userId,
      status
    });

    clients.forEach(client => {
      if (client.userId !== userId) {
        client.ws.send(message);
      }
    });
  }

  function updatePresence(message: any) {
    broadcastPresence(message.userId, message.status);
  }
}