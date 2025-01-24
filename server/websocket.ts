
import { WebSocket, WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { Express } from 'express';
import { supabase } from "@db";
import type { Tables } from "@/lib/supabase";

interface DirectMessage {
  type: 'direct_message';
  senderId: number;
  receiverId: number;
  content: string;
  timestamp: string;
  businessId?: number;
}

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
    const { data: user, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (error) throw error;
    if (user) {
      console.log(`User ${userId} role found:`, user.role);
      return user.role;
    }

    const { data: customer, error: customerError } = await supabase
      .from('tickets')
      .select()
      .eq('customer_id', userId)
      .limit(1);

    if (customerError) throw customerError;
    if (customer && customer.length > 0) {
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
        const message = JSON.parse(data);
        console.log('Received message:', {
          type: message.type,
          senderId: message.senderId,
          receiverId: message.receiverId,
          businessId: message.businessId
        });

        if (message.type === 'ping') {
          ws.isAlive = true;
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }

        if (!message.senderId || message.senderId !== userId) {
          throw new Error('Invalid sender ID');
        }

        if (message.type === 'direct_message') {
          const { data: sender, error: senderError } = await supabase
            .from('users')
            .select()
            .eq('id', userId)
            .single();

          if (senderError || !sender || (sender.role !== 'employee' && sender.role !== 'business')) {
            throw new Error('Only employees and businesses can send direct messages');
          }

          if (sender.role === 'employee') {
            const { data: senderBusiness, error: businessError } = await supabase
              .from('business_employees')
              .select()
              .eq('employee_id', userId)
              .eq('is_active', true)
              .single();

            if (businessError || !senderBusiness) {
              throw new Error('Employee not associated with any business');
            }

            if (message.businessId) {
              if (message.businessId !== senderBusiness.business_profile_id) {
                throw new Error('Not authorized to send messages to this business');
              }
            } else {
              const { data: receiverBusiness, error: receiverError } = await supabase
                .from('business_employees')
                .select()
                .eq('employee_id', message.receiverId)
                .eq('business_profile_id', senderBusiness.business_profile_id)
                .eq('is_active', true)
                .single();

              if (receiverError || !receiverBusiness) {
                throw new Error('Cannot send messages to employees from different businesses');
              }

              message.businessId = senderBusiness.business_profile_id;
            }
          }

          const { data: savedMessage, error: messageError } = await supabase
            .from('direct_messages')
            .insert([{
              content: message.content,
              sender_id: userId,
              receiver_id: message.receiverId,
              business_profile_id: message.businessId,
              status: 'sent',
              sent_at: new Date().toISOString(),
              created_at: new Date().toISOString()
            }])
            .select()
            .single();

          if (messageError) throw messageError;

          const responseMessage = {
            type: 'direct_message',
            id: savedMessage.id,
            content: savedMessage.content,
            senderId: savedMessage.sender_id,
            receiverId: savedMessage.receiver_id,
            businessId: savedMessage.business_profile_id,
            status: savedMessage.status,
            sentAt: savedMessage.sent_at,
            createdAt: savedMessage.created_at
          };

          ws.send(JSON.stringify(responseMessage));

          const receiverRole = await determineUserRole(message.receiverId);
          if (receiverRole) {
            const receiverWs = connections.get(`${message.receiverId}-${receiverRole}`);
            if (receiverWs?.readyState === WebSocket.OPEN) {
              receiverWs.send(JSON.stringify(responseMessage));
              console.log('Direct message sent successfully to receiver');
            } else {
              console.log(`Receiver ${message.receiverId} (${receiverRole}) is not connected`);
            }
          }
        } else if (message.type === 'message') {
          if (!message.ticketId) {
            throw new Error('Ticket ID is required');
          }

          const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .select()
            .eq('id', message.ticketId)
            .single();

          if (ticketError || !ticket) {
            throw new Error('Invalid ticket');
          }

          let receiverId: number;
          if (message.senderId === ticket.customer_id) {
            receiverId = ticket.claimed_by_id || ticket.business_profile_id;
          } else {
            receiverId = ticket.customer_id;
          }

          const { data: savedMessage, error: messageError } = await supabase
            .from('messages')
            .insert([{
              content: message.content,
              sender_id: userId,
              receiver_id: receiverId,
              ticket_id: message.ticketId,
              status: 'sent',
              chat_initiator: message.chatInitiator || false,
              initiated_at: message.chatInitiator ? new Date().toISOString() : null,
              sent_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            }])
            .select()
            .single();

          if (messageError) throw messageError;

          const responseMessage = {
            type: 'message',
            id: savedMessage.id,
            content: savedMessage.content,
            senderId: savedMessage.sender_id,
            receiverId: savedMessage.receiver_id,
            ticketId: savedMessage.ticket_id,
            status: savedMessage.status,
            chatInitiator: savedMessage.chat_initiator,
            initiatedAt: savedMessage.initiated_at,
            sentAt: savedMessage.sent_at,
            createdAt: savedMessage.created_at,
          };

          ws.send(JSON.stringify(responseMessage));

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
