import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';
import { db } from "@db";
import { messages, users } from "@db/schema";
import { eq } from "drizzle-orm";
import type { User } from "@db/schema";

interface Message {
  type: string;
  senderId: number;
  receiverId: number;
  content: string;
  timestamp: string;
}

// Store active connections with role information
const connections = new Map<string, WebSocket>();

export function setupWebSocket(server: Server, app: Express) {
  const wss = new WebSocketServer({ noServer: true });

  // Keep track of connection attempts
  const connectionAttempts = new Map<string, number>();
  const MAX_ATTEMPTS = 5;
  const HEARTBEAT_INTERVAL = 30000; // 30 seconds

  function heartbeat(ws: WebSocket) {
    (ws as any).isAlive = true;
  }

  function noop() {}

  // Set up heartbeat interval
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if ((ws as any).isAlive === false) {
        console.log('Terminating inactive connection');
        return ws.terminate();
      }

      (ws as any).isAlive = false;
      ws.ping(noop);
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => {
    clearInterval(interval);
  });

  // Handle WebSocket connections
  wss.on('connection', async (ws: WebSocket, user: User) => {
    console.log(`New WebSocket connection for ${user.role} user ${user.id}`);
    const connectionKey = `${user.id}-${user.role}`;
    connections.set(connectionKey, ws);

    // Set up heartbeat
    (ws as any).isAlive = true;
    ws.on('pong', () => heartbeat(ws));

    // Send initial connection success message
    ws.send(JSON.stringify({ 
      type: 'connection', 
      status: 'connected',
      userId: user.id,
      role: user.role
    }));

    // Handle incoming messages
    ws.on('message', async (data: string) => {
      try {
        const message: Message = JSON.parse(data);
        console.log(`Received message:`, message);

        if (message.type !== 'message') {
          console.log('Ignoring non-message type:', message.type);
          return;
        }

        // Validate sender matches authenticated user
        if (message.senderId !== user.id) {
          throw new Error('Unauthorized: Sender ID does not match authenticated user');
        }

        // Validate message format
        if (!message.senderId || !message.receiverId || !message.content?.trim()) {
          throw new Error('Invalid message format');
        }

        // Verify receiver exists
        const [receiver] = await db
          .select()
          .from(users)
          .where(eq(users.id, message.receiverId))
          .limit(1);

        if (!receiver) {
          throw new Error('Receiver not found');
        }

        // Save message to database
        const [savedMessage] = await db.insert(messages)
          .values({
            content: message.content,
            senderId: message.senderId,
            receiverId: message.receiverId,
            createdAt: new Date(message.timestamp)
          })
          .returning();

        console.log('Saved message to database:', savedMessage);

        // Create response message
        const responseMessage = {
          id: savedMessage.id,
          content: savedMessage.content,
          senderId: savedMessage.senderId,
          receiverId: savedMessage.receiverId,
          timestamp: savedMessage.createdAt.toISOString()
        };

        // Forward message to receiver if online
        const receiverRoles = ['business', 'customer', 'employee'];
        let delivered = false;

        for (const receiverRole of receiverRoles) {
          const receiverWs = connections.get(`${message.receiverId}-${receiverRole}`);
          if (receiverWs?.readyState === WebSocket.OPEN) {
            console.log(`Forwarding message to ${receiverRole} ${message.receiverId}`);
            receiverWs.send(JSON.stringify(responseMessage));
            delivered = true;
            break;
          }
        }

        if (!delivered) {
          console.log(`Receiver ${message.receiverId} is not online, message stored in database only`);
        }

        // Send confirmation back to sender
        ws.send(JSON.stringify({
          ...responseMessage,
          delivered
        }));

      } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({ 
          type: 'error',
          error: error instanceof Error ? error.message : 'Failed to process message' 
        }));
      }
    });

    // Handle connection close
    ws.on('close', () => {
      console.log(`User ${user.id} (${user.role}) disconnected`);
      connections.delete(connectionKey);
    });

    // Handle connection errors
    ws.on('error', (error) => {
      console.error(`WebSocket error for user ${user.id} (${user.role}):`, error);
      connections.delete(connectionKey);
    });
  });

  // Handle upgrade requests
  server.on('upgrade', async (request, socket, head) => {
    // Skip vite HMR requests
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    try {
      // Get session from the request
      const session = (request as any).session;
      if (!session?.passport?.user) {
        console.error('No authenticated session found');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Get user from database
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, session.passport.user))
        .limit(1);

      if (!user) {
        console.error('User not found in database');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const connectionKey = `${user.id}-${user.role}`;
      const attempts = connectionAttempts.get(connectionKey) || 0;

      if (attempts >= MAX_ATTEMPTS) {
        console.error(`Too many connection attempts for ${connectionKey}`);
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }

      connectionAttempts.set(connectionKey, attempts + 1);

      console.log('Upgrading connection for authenticated user:', user.id, 'role:', user.role);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, user);
        // Reset connection attempts on successful connection
        connectionAttempts.delete(connectionKey);
      });
    } catch (error) {
      console.error('Error handling WebSocket upgrade:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });
}