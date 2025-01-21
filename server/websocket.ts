import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';
import { supabase } from "@db";
import type { Message } from "@db/schema";

interface WebSocketMessage {
  type: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
}

// Store active connections with role information
const connections = new Map<string, WebSocket>();

export function setupWebSocket(server: Server, app: Express) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket connections
  wss.on('connection', (ws: WebSocket, userId: string, role: string) => {
    console.log(`New WebSocket connection for ${role} user ${userId}`);
    const connectionKey = `${userId}-${role}`;
    connections.set(connectionKey, ws);

    // Handle incoming messages
    ws.on('message', async (data: string) => {
      try {
        const message: WebSocketMessage = JSON.parse(data);
        console.log(`Received message:`, message);

        if (message.type !== 'message') {
          console.log('Ignoring non-message type:', message.type);
          return;
        }

        // Save message to Supabase
        const { data: savedMessage, error } = await supabase
          .from('messages')
          .insert({
            content: message.content,
            sender_id: message.senderId,
            receiver_id: message.receiverId,
            created_at: new Date(message.timestamp).toISOString()
          })
          .select()
          .single();

        if (error) {
          console.error('Error saving message:', error);
          ws.send(JSON.stringify({ 
            type: 'error',
            error: 'Failed to save message'
          }));
          return;
        }

        console.log('Saved message to database:', savedMessage);

        // Create response message
        const responseMessage = {
          id: savedMessage.id,
          content: savedMessage.content,
          senderId: savedMessage.sender_id,
          receiverId: savedMessage.receiver_id,
          createdAt: savedMessage.created_at
        };

        // Forward message to receiver if online (try both business and customer roles)
        const receiverRoles = ['business', 'customer'];
        for (const receiverRole of receiverRoles) {
          const receiverWs = connections.get(`${message.receiverId}-${receiverRole}`);
          if (receiverWs?.readyState === WebSocket.OPEN) {
            console.log(`Forwarding message to ${receiverRole} ${message.receiverId}`);
            receiverWs.send(JSON.stringify(responseMessage));
          }
        }

        // Send confirmation back to sender
        ws.send(JSON.stringify(responseMessage));

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
      const userId = url.searchParams.get('userId');
      const role = url.searchParams.get('role');

      if (!userId || !role || !['business', 'customer', 'employee'].includes(role)) {
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