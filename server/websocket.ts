import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';
import { db } from "@db";
import { messages, businessEmployees, tickets } from "@db/schema";
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
  directMessageUserId?: number;
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

async function validateDirectMessage(senderId: number, receiverId: number) {
  try {
    const [senderEmployee] = await db
      .select()
      .from(businessEmployees)
      .where(
        and(
          eq(businessEmployees.employeeId, senderId),
          eq(businessEmployees.isActive, true)
        )
      );

    const [receiverEmployee] = await db
      .select()
      .from(businessEmployees)
      .where(
        and(
          eq(businessEmployees.employeeId, receiverId),
          eq(businessEmployees.isActive, true)
        )
      );

    if (senderEmployee && receiverEmployee) {
      return senderEmployee.businessId === receiverEmployee.businessId;
    }

    return false;
  } catch (error) {
    console.error('Error validating direct message:', error);
    return false;
  }
}

async function determineUserRole(userId: number): Promise<string | null> {
  try {
    // First check if user is an employee
    const [employee] = await db
      .select()
      .from(businessEmployees)
      .where(
        and(
          eq(businessEmployees.employeeId, userId),
          eq(businessEmployees.isActive, true)
        )
      )
      .limit(1);

    if (employee) return 'employee';

    // Then check if user is a business
    const [business] = await db
      .select()
      .from(businessEmployees)
      .where(eq(businessEmployees.businessId, userId))
      .limit(1);

    if (business) return 'business';

    // Finally check if user is a customer
    const [customer] = await db
      .select()
      .from(tickets)
      .where(eq(tickets.customerId, userId))
      .limit(1);

    if (customer) return 'customer';

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

        let receiverId: number;
        const ticketId = message.ticketId;

        // Handle direct messages
        if (message.directMessageUserId) {
          receiverId = message.directMessageUserId;
          const isValidDirectMessage = await validateDirectMessage(userId, receiverId);
          if (!isValidDirectMessage) {
            throw new Error('Unauthorized direct message');
          }
        } 
        // Handle ticket messages
        else if (ticketId) {
          const [ticket] = await db
            .select()
            .from(tickets)
            .where(eq(tickets.id, ticketId));

          if (!ticket) {
            throw new Error('Invalid ticket');
          }

          if (message.senderId === ticket.customerId) {
            receiverId = ticket.claimedById || ticket.businessId!;
          } else {
            receiverId = ticket.customerId;
          }
        } else {
          throw new Error('Either ticketId or directMessageUserId is required');
        }

        // Save message to database
        const [savedMessage] = await db
          .insert(messages)
          .values({
            content: message.content,
            senderId: userId,
            receiverId,
            ticketId,
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
          } else {
            console.log(`Receiver ${receiverId} (${receiverRole}) is not connected or WebSocket not open`);
          }
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