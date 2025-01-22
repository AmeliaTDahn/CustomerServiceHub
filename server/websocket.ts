import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';
import { db } from "@db";
import { messages, unreadMessages } from "@db/schema";
import { eq, and, sql } from "drizzle-orm";

interface Message {
  type: string;
  senderId: number;
  receiverId: number;
  content: string;
  timestamp: string;
  messageId?: number;
  ticketId: number; // Added ticketId
}

interface StatusUpdate {
  type: string;
  messageId: number;
  status: 'delivered' | 'read';
  timestamp: string;
}

// Store active connections with role information
const connections = new Map<string, WebSocket>();

export function setupWebSocket(server: Server, app: Express) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, userId: number, role: string) => {
    console.log(`New WebSocket connection for ${role} user ${userId}`);
    const connectionKey = `${userId}-${role}`;
    connections.set(connectionKey, ws);

    // Update all undelivered messages to this user as delivered
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

          // Notify senders their messages were delivered
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
      }
    })();

    // Handle incoming messages
    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data);
        console.log(`Received message:`, message);

        if (message.type === 'status_update') {
          // Handle status update
          const update = message as StatusUpdate;
          await db
            .update(messages)
            .set({
              status: update.status,
              ...(update.status === 'delivered' ? { deliveredAt: new Date() } : { readAt: new Date() })
            })
            .where(eq(messages.id, update.messageId));

          // Forward status update to sender
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

        if (message.type !== 'message') {
          console.log('Ignoring non-message type:', message.type);
          return;
        }

        // Save new message to database
        const [savedMessage] = await db.insert(messages)
          .values({
            content: message.content,
            senderId: message.senderId,
            receiverId: message.receiverId,
            status: 'sent',
            sentAt: new Date(),
            createdAt: new Date(message.timestamp),
            ticketId: message.ticketId // Added ticketId
          })
          .returning();

        console.log('Saved message to database:', savedMessage);

        // Update unread messages count
        await db.insert(unreadMessages)
          .values({
            userId: message.receiverId,
            ticketId: message.ticketId,
            count: sql`1`,
            updatedAt: new Date()
          })
          .onConflictDoUpdate({
            target: [unreadMessages.userId, unreadMessages.ticketId],
            set: {
              count: sql`${unreadMessages.count} + 1`,
              updatedAt: new Date()
            }
          });

        // Create response message
        const responseMessage = {
          id: savedMessage.id,
          type: 'message',
          content: savedMessage.content,
          senderId: savedMessage.senderId,
          receiverId: savedMessage.receiverId,
          status: savedMessage.status,
          sentAt: savedMessage.sentAt.toISOString(),
          createdAt: savedMessage.createdAt.toISOString()
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

            // Update message as delivered immediately
            await db
              .update(messages)
              .set({
                status: 'delivered',
                deliveredAt: new Date()
              })
              .where(eq(messages.id, savedMessage.id));

            // Send delivery status back to sender
            const deliveryStatus: StatusUpdate = {
              type: 'status_update',
              messageId: savedMessage.id,
              status: 'delivered',
              timestamp: new Date().toISOString()
            };
            ws.send(JSON.stringify(deliveryStatus));
          }
        }

        // If not delivered, keep status as 'sent'
        if (!delivered) {
          ws.send(JSON.stringify(responseMessage));
        }

      } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({ 
          type: 'error',
          error: 'Failed to process message' 
        }));
      }
    });

    // Handle connection close
    ws.on('close', () => {
      console.log(`User ${userId} (${role}) disconnected`);
      connections.delete(`${userId}-${role}`);
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
    // Skip vite HMR requests
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