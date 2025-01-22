import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';
import { db } from "@db";
import { messages, unreadMessages, tickets, businessEmployees } from "@db/schema";
import { eq, and, or } from "drizzle-orm";
import pkg from 'pg';
const { Pool } = pkg;

interface Message {
  type: string;
  senderId: number;
  receiverId: number;
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
  isAlive?: boolean;
}

const connections = new Map<string, ExtendedWebSocket>();

async function validateDirectMessage(senderId: number, receiverId: number) {
  const [relationship] = await db.select()
    .from(businessEmployees)
    .where(
      or(
        and(
          eq(businessEmployees.businessId, senderId),
          eq(businessEmployees.employeeId, receiverId),
          eq(businessEmployees.isActive, true)
        ),
        and(
          eq(businessEmployees.businessId, receiverId),
          eq(businessEmployees.employeeId, senderId),
          eq(businessEmployees.isActive, true)
        )
      )
    );

  return !!relationship;
}

export function setupWebSocket(server: Server, app: Express) {
  const wss = new WebSocketServer({ noServer: true });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  (async () => {
    const client = await pool.connect();
    try {
      await client.query('LISTEN new_message');
      client.on('notification', async (msg) => {
        if (msg.channel === 'new_message' && msg.payload) {
          const payload = JSON.parse(msg.payload);
          const receiverRole = await determineUserRole(payload.receiver_id);
          if (receiverRole) {
            const receiverWs = connections.get(`${payload.receiver_id}-${receiverRole}`);
            if (receiverWs?.readyState === WebSocket.OPEN) {
              receiverWs.send(JSON.stringify({
                type: 'message',
                id: payload.id,
                senderId: payload.sender_id,
                receiverId: payload.receiver_id,
                content: payload.content,
                status: payload.status,
                ticketId: payload.ticket_id,
                sentAt: payload.sent_at,
                createdAt: payload.created_at
              }));
            }
          }
        }
      });
    } catch (err) {
      console.error('Error setting up PostgreSQL LISTEN:', err);
      client.release();
    }
  })();

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: ExtendedWebSocket) => {
      if (ws.isAlive === false) {
        console.log(`Terminating inactive connection for user ${ws.userId}`);
        return ws.terminate();
      }
      ws.isAlive = false;
      try {
        ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
      } catch (error) {
        console.error('Error sending ping:', error);
        ws.terminate();
      }
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    pool.end();
  });

  async function determineUserRole(userId: number): Promise<string | null> {
    try {
      const [user] = await db.select()
        .from(tickets)
        .where(eq(tickets.customerId, userId))
        .limit(1);
      if (user) return 'customer';
      const [business] = await db.select()
        .from(tickets)
        .where(eq(tickets.businessId, userId))
        .limit(1);
      if (business) return 'business';
      return 'employee';
    } catch (error) {
      console.error('Error determining user role:', error);
      return null;
    }
  }

  wss.on('connection', (ws: ExtendedWebSocket, userId: number, role: string) => {
    console.log(`New WebSocket connection for ${role} user ${userId}`);
    ws.userId = userId;
    ws.role = role;
    ws.isAlive = true;
    const connectionKey = `${userId}-${role}`;
    connections.set(connectionKey, ws);
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    (async () => {
      try {
        const [undeliveredMessages] = await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.receiverId, userId),
              eq(messages.status, 'sent')
            )
          );
        if (undeliveredMessages) {
          await db
            .update(messages)
            .set({
              status: 'delivered',
              deliveredAt: new Date()
            })
            .where(
              and(
                eq(messages.receiverId, userId),
                eq(messages.status, 'sent')
              )
            );
          const statusUpdate: StatusUpdate = {
            type: 'status_update',
            messageId: undeliveredMessages.id,
            status: 'delivered',
            timestamp: new Date().toISOString()
          };
          const senderWs = connections.get(`${undeliveredMessages.senderId}-${role}`);
          if (senderWs?.readyState === WebSocket.OPEN) {
            senderWs.send(JSON.stringify(statusUpdate));
          }
        }
      } catch (error) {
        console.error('Error updating message status:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Failed to update message status'
        }));
      }
    })();

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'ping') {
          ws.isAlive = true;
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        if (message.type === 'status_update') {
          const update = message as StatusUpdate;
          await db
            .update(messages)
            .set({
              status: update.status,
              ...(update.status === 'delivered' ? { deliveredAt: new Date() } : { readAt: new Date() })
            })
            .where(eq(messages.id, update.messageId));
          const [updatedMessage] = await db
            .select()
            .from(messages)
            .where(eq(messages.id, update.messageId));
          if (updatedMessage) {
            const senderWs = connections.get(`${updatedMessage.senderId}-${role}`);
            if (senderWs?.readyState === WebSocket.OPEN) {
              senderWs.send(JSON.stringify(update));
            }
          }
          return;
        }
        if (message.type === 'message') {
          if (message.senderId !== userId) {
            throw new Error('Invalid sender ID');
          }
          let receiverId: number;
          let ticketId: number | undefined = message.ticketId;
          let isInitiator = message.chatInitiator || false;
          if (message.directMessageUserId) {
            receiverId = message.directMessageUserId;
            ticketId = undefined;
            const isValidDirectMessage = await validateDirectMessage(message.senderId, receiverId);
            if (!isValidDirectMessage) {
              throw new Error('Unauthorized direct message');
            }
          } else if (message.ticketId) {
            const [ticket] = await db
              .select()
              .from(tickets)
              .where(eq(tickets.id, message.ticketId));
            if (!ticket) {
              throw new Error('Invalid ticket');
            }
            if (message.senderId === ticket.customerId) {
              receiverId = ticket.businessId!;
            } else {
              receiverId = ticket.customerId;
            }
            ticketId = ticket.id;
          } else if (message.receiverId) {
            receiverId = message.receiverId;
            const isValidDirectMessage = await validateDirectMessage(message.senderId, receiverId);
            if (!isValidDirectMessage) {
              throw new Error('Unauthorized direct message');
            }
          } else {
            throw new Error('Invalid message: missing recipient information');
          }
          const [savedMessage] = await db.insert(messages)
            .values({
              content: message.content,
              senderId: message.senderId,
              receiverId: receiverId,
              status: 'sent',
              chatInitiator: isInitiator,
              initiatedAt: isInitiator ? new Date() : null,
              sentAt: new Date(),
              createdAt: new Date(message.timestamp),
              ticketId: ticketId
            })
            .returning();
          const responseMessage = {
            id: savedMessage.id,
            type: 'message',
            content: savedMessage.content,
            senderId: savedMessage.senderId,
            receiverId: receiverId,
            status: savedMessage.status,
            chatInitiator: savedMessage.chatInitiator,
            initiatedAt: savedMessage.initiatedAt?.toISOString(),
            sentAt: savedMessage.sentAt.toISOString(),
            createdAt: savedMessage.createdAt.toISOString(),
            ticketId: savedMessage.ticketId
          };
          ws.send(JSON.stringify(responseMessage));
          const receiverRole = await determineUserRole(receiverId);
          if (receiverRole) {
            const receiverWs = connections.get(`${receiverId}-${receiverRole}`);
            if (receiverWs?.readyState === WebSocket.OPEN) {
              receiverWs.send(JSON.stringify(responseMessage));
            }
          }
        }
      } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: (error as Error).message || 'Failed to process message'
        }));
      }
    });
    ws.on('close', () => {
      console.log(`User ${userId} (${role}) disconnected`);
      ws.isAlive = false;
      connections.delete(`${userId}-${role}`);
    });
    ws.on('error', (error) => {
      console.error(`WebSocket error for user ${userId}:`, error);
      ws.isAlive = false;
      connections.delete(`${userId}-${role}`);
    });
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      userId: userId,
      role: role
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