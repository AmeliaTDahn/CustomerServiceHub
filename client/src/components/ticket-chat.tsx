import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import { Loader2, Check, CheckCheck, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { Ticket } from "@db/schema";

interface Message {
  message: {
    id: number;
    content: string;
    ticketId: number | null;
    senderId: number;
    receiverId: number;
    status: string;
    chatInitiator?: boolean;
    initiatedAt?: string | null;
    sentAt: string;
    createdAt: string;
  };
  sender: {
    id: number;
    username: string;
    role: string;
  };
}

interface TicketChatProps {
  ticketId?: number;
  readonly?: boolean;
  directMessageUserId?: number;
  chatType?: 'ticket' | 'business' | 'employee';
}

const MessageHeader = ({ username, role, isBroadcast }: { username: string; role: string; isBroadcast?: boolean }) => (
  <div className="flex items-center gap-2 mb-1">
    <p className="text-sm font-medium">{username}</p>
    {isBroadcast && (
      <span className="flex items-center gap-1 text-xs text-blue-500">
        <Megaphone className="h-3 w-3" />
        Broadcasting
      </span>
    )}
  </div>
);

export default function TicketChat({ ticketId, readonly = false, directMessageUserId, chatType = 'ticket' }: TicketChatProps) {
  const [newMessage, setNewMessage] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const { user } = useUser();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { isConnected, sendMessage, sendReadReceipt } = useWebSocket(user?.id, user?.role);
  const lastProcessedMessagesRef = useRef<Set<number>>(new Set());

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: directMessageUserId
      ? [`/api/messages/${chatType === 'business' ? 'business' : 'direct'}`, directMessageUserId]
      : ticketId ? ['/api/tickets', ticketId, 'messages'] : [],
    queryFn: async () => {
      if (!directMessageUserId && !ticketId) return [];

      const endpoint = directMessageUserId
        ? `/api/messages/${chatType === 'business' ? 'business' : 'direct'}/${directMessageUserId}`
        : `/api/tickets/${ticketId}/messages`;

      const res = await fetch(endpoint, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!(directMessageUserId || ticketId),
    refetchInterval: 5000
  });

  useEffect(() => {
    if (!user) return;

    const currentMessages = new Set(messages.map(m => m.message.id));
    const processedMessages = lastProcessedMessagesRef.current;

    messages.forEach(messageData => {
      const messageId = messageData.message.id;

      if (!processedMessages.has(messageId) &&
          messageData.sender.id !== user.id &&
          messageData.message.status !== 'read') {

        sendReadReceipt(messageId);
        processedMessages.add(messageId);
      }
    });

    Array.from(processedMessages).forEach(id => {
      if (!currentMessages.has(id)) {
        processedMessages.delete(id);
      }
    });

    lastProcessedMessagesRef.current = processedMessages;
  }, [messages, user, sendReadReceipt]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, optimisticMessages]);

  const { data: ticket } = useQuery<Ticket>({
    queryKey: ['/api/tickets', ticketId],
    enabled: !!ticketId && !directMessageUserId,
  });

  const isEmployee = user?.role === 'employee';
  const isBusiness = user?.role === 'business';
  const isCustomer = user?.role === 'customer';

  const canSendMessages = () => {
    if (readonly) return false;
    if (directMessageUserId) return true;
    if (isEmployee || isBusiness) return true;

    // Allow customers to send messages in their own tickets that aren't resolved
    if (isCustomer && ticket?.customerId === user?.id && ticket?.status !== "resolved") {
      return true;
    }
    return false;
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!isConnected) {
        throw new Error("Not connected to message server");
      }

      let receiverId: number;
      const isCustomer = user?.role === 'customer';

      if (directMessageUserId) {
        receiverId = directMessageUserId;
      } else if (ticket) {
        if (isCustomer) {
          receiverId = ticket.claimedById || ticket.businessId!;
        } else {
          receiverId = ticket.customerId;
        }
      } else {
        throw new Error("Invalid message target");
      }

      const isBroadcast = isCustomer && ticket && !ticket.claimedById;

      const optimisticMessage: Message = {
        message: {
          id: Date.now(),
          content,
          ticketId: ticketId || null,
          senderId: user!.id,
          receiverId,
          status: 'sending',
          chatInitiator: messages.length === 0,
          initiatedAt: messages.length === 0 ? new Date().toISOString() : null,
          sentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        sender: {
          id: user!.id,
          username: user!.username,
          role: user!.role,
        },
      };

      setOptimisticMessages(prev => [...prev, optimisticMessage]);

      sendMessage({
        type: 'message',
        senderId: user!.id,
        receiverId,
        content,
        timestamp: new Date().toISOString(),
        ticketId: ticketId || undefined,
        directMessageUserId,
        chatType,
        chatInitiator: messages.length === 0,
      });

      return optimisticMessage;
    },
    onSuccess: () => {
      setNewMessage("");

      if (directMessageUserId) {
        queryClient.invalidateQueries({
          queryKey: [`/api/messages/${chatType === 'business' ? 'business' : 'direct'}`, directMessageUserId]
        });
      } else if (ticketId) {
        queryClient.invalidateQueries({
          queryKey: ['/api/tickets', ticketId, 'messages']
        });
      }
    },
    onError: (error) => {
      setOptimisticMessages([]);
      toast({
        variant: "destructive",
        title: "Error sending message",
        description: (error as Error).message
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || readonly || !user || !canSendMessages() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(newMessage.trim());
  };

  const allMessages = [...messages, ...optimisticMessages];

  return (
    <div className="flex flex-col h-full relative">
      {!readonly && ticket && messages.length === 0 && user?.role === 'customer' && (
        <div className="bg-blue-50 text-blue-700 px-4 py-2 text-sm flex items-center gap-2 absolute top-0 left-0 right-0 z-10">
          <Megaphone className="h-4 w-4" />
          Your message will be sent to support staff.
        </div>
      )}

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-4 py-4">
          <AnimatePresence initial={false}>
            {allMessages?.map((messageData) => (
              <motion.div
                key={messageData.message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`flex ${
                  messageData.sender.id === user?.id ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg p-3",
                    messageData.sender.id === user?.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <MessageHeader
                    username={messageData.sender.username}
                    role={messageData.sender.role}
                    isBroadcast={
                      messageData.sender.id === user?.id &&
                      user?.role === 'customer' &&
                      ticket &&
                      !ticket.claimedById
                    }
                  />
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {messageData.message.content}
                  </p>
                  <div className="flex items-center justify-between mt-1 text-xs opacity-70">
                    <span>{new Date(messageData.message.sentAt).toLocaleTimeString()}</span>
                    {messageData.sender.id === user?.id && (
                      <span className="ml-2 flex items-center gap-1">
                        {messageData.message.status === 'sending' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : messageData.message.status === 'sent' ? (
                          <Check className="h-3 w-3" />
                        ) : messageData.message.status === 'delivered' ? (
                          <CheckCheck className="h-3 w-3" />
                        ) : messageData.message.status === 'read' ? (
                          <motion.span
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className="text-blue-500"
                          >
                            <CheckCheck className="h-3 w-3" />
                          </motion.span>
                        ) : null}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {allMessages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No messages yet
            </p>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {canSendMessages() && (
        <div className="border-t p-4 bg-background mt-auto">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={
                isConnected
                  ? "Type your message..."
                  : "Connecting..."
              }
              className="flex-1"
              disabled={!isConnected || sendMessageMutation.isPending}
            />
            <Button
              type="submit"
              disabled={!newMessage.trim() || !isConnected || sendMessageMutation.isPending}
              className="relative"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Send"
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}