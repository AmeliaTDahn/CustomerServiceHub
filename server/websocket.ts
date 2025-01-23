import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';
import { db } from "@db";
import { messages, businessEmployees, tickets, users } from "@db/schema";
import { eq, and, or } from "drizzle-orm";
import pkg from 'pg';
const { Pool } = pkg;

interface Message {
  type: string;
  senderId: number;
  receiverId?: number;
  content: string;
  timestamp: string;
  messageId?: number;
  ticketId?: number;
  chatInitiator?: boolean;
}

interface StatusUpdate {
  type: string;
  messageId: number;
  status: 'delivered' | 'read';
  timestamp: string;
}

interface ExtendedWebSocket extends WebSocket {
  userId?: number;
  role?: string;
  isAlive: boolean;
}

const connections = new Map<string, ExtendedWebSocket>();

async function determineUserRole(userId: number): Promise<string | null> {
  try {
    // Check user role directly from the users table first
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user) {
      console.log(`User ${userId} role found:`, user.role);
      return user.role;
    }

    // Finally check if user is a customer
    const [customer] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.customerId, userId))
      .limit(1);

    if (customer) {
      console.log(`User ${userId} is a customer`);
      return 'customer';
    }

    console.error(`No role found for user ${userId}`);
    return null;
  } catch (error) {
    console.error('Error determining user role:', error);
    return null;
  }
}

export function setupWebSocket(server: Server, _app: Express) {
  const wss = new WebSocketServer({ noServer: true });

  const heartbeat = (ws: ExtendedWebSocket) => {
    ws.isAlive = true;
    console.log(`Heartbeat received for user ${ws.userId}`);
  };

  const interval = setInterval(() => {
    wss.clients.forEach((ws: ExtendedWebSocket) => {
      if (ws.isAlive === false) {
        console.log(`Terminating inactive connection for user ${ws.userId}`);
        return ws.terminate();
      }

      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  wss.on('connection', async (ws: ExtendedWebSocket, userId: number, role: string) => {
    console.log(`New WebSocket connection for ${role} user ${userId}`);
    ws.userId = userId;
    ws.role = role;
    ws.isAlive = true;

    const connectionKey = `${userId}-${role}`;
    const existingConnection = connections.get(connectionKey);
    if (existingConnection) {
      console.log(`Closing existing connection for ${connectionKey}`);
      existingConnection.close();
      connections.delete(connectionKey);
    }

    connections.set(connectionKey, ws);

    ws.on('pong', () => heartbeat(ws));

    ws.on('message', async (data: string) => {
      try {
        const message: Message = JSON.parse(data);
        console.log('Received message:', {
          type: message.type,
          senderId: message.senderId,
          receiverId: message.receiverId,
          ticketId: message.ticketId
        });

        if (message.type === 'ping') {
          ws.isAlive = true;
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (message.type !== 'message') {
          return;
        }

        if (!message.senderId || message.senderId !== userId) {
          throw new Error('Invalid sender ID');
        }

        // Only handle ticket-related messages
        if (!message.ticketId) {
          throw new Error('Ticket ID is required');
        }

        const [ticket] = await db
          .select()
          .from(tickets)
          .where(eq(tickets.id, message.ticketId));

        if (!ticket) {
          throw new Error('Invalid ticket');
        }

        let receiverId: number;
        if (message.senderId === ticket.customerId) {
          receiverId = ticket.claimedById || ticket.businessId!;
        } else {
          receiverId = ticket.customerId;
        }

        // Save message to database
        const [savedMessage] = await db
          .insert(messages)
          .values({
            content: message.content,
            senderId: userId,
            receiverId,
            ticketId: message.ticketId,
            status: 'sent',
            chatInitiator: message.chatInitiator || false,
            initiatedAt: message.chatInitiator ? new Date() : null,
            sentAt: new Date(),
            createdAt: new Date(),
          })
          .returning();

        const responseMessage = {
          type: 'message',
          id: savedMessage.id,
          content: savedMessage.content,
          senderId: savedMessage.senderId,
          receiverId: savedMessage.receiverId,
          ticketId: savedMessage.ticketId,
          status: savedMessage.status,
          chatInitiator: savedMessage.chatInitiator,
          initiatedAt: savedMessage.initiatedAt?.toISOString(),
          sentAt: savedMessage.sentAt.toISOString(),
          createdAt: savedMessage.createdAt.toISOString(),
        };

        // Send confirmation to sender
        ws.send(JSON.stringify(responseMessage));

        // Send to receiver
        const receiverRole = await determineUserRole(receiverId);
        if (receiverRole) {
          console.log(`Sending message to ${receiverId} with role ${receiverRole}`);
          const receiverWs = connections.get(`${receiverId}-${receiverRole}`);
          if (receiverWs?.readyState === WebSocket.OPEN) {
            receiverWs.send(JSON.stringify(responseMessage));
            console.log('Message sent successfully to receiver');
          } else {
            console.log(`Receiver ${receiverId} (${receiverRole}) is not connected or WebSocket not open`);
          }
        } else {
          console.error(`Could not determine role for receiver ${receiverId}`);
        }

      } catch (error) {
        console.error('Error handling WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: (error as Error).message
        }));
      }
    });

    ws.on('close', () => {
      console.log(`User ${userId} (${role}) disconnected`);
      connections.delete(connectionKey);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for user ${userId}:`, error);
      connections.delete(connectionKey);
    });

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      userId,
      role
    }));
  });

  server.on('upgrade', (request, socket, head) => {
    if (request.headers['sec-websocket-protocol'] === 'vite-hmr') {
      return;
    }

    try {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const userId = parseInt(url.searchParams.get('userId') || '');
      const role = url.searchParams.get('role') || '';

      if (!userId || isNaN(userId) || !role || !['business', 'customer', 'employee'].includes(role)) {
        console.error('Invalid WebSocket connection parameters:', { userId, role });
        socket.destroy();
        return;
      }

      console.log('Upgrading connection for user:', userId, 'role:', role);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, userId, role);
      });
    } catch (error) {
      console.error('Error handling WebSocket upgrade:', error);
      socket.destroy();
    }
  });
}