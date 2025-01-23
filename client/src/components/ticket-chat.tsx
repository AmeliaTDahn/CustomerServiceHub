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
import { QuickReplyTemplates } from "@/components/quick-reply-templates";

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

export default function TicketChat({ ticketId, readonly = false }: TicketChatProps) {
  const [newMessage, setNewMessage] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<Map<number, Message>>(new Map());
  const { user } = useUser();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { isConnected, sendMessage, sendReadReceipt } = useWebSocket(user?.id, user?.role);
  const lastProcessedMessagesRef = useRef<Set<number>>(new Set());

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ticketId ? ['/api/tickets', ticketId, 'messages'] : [],
    queryFn: async () => {
      if (!ticketId) return [];

      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!ticketId
  });

  useEffect(() => {
    // Clean up stale optimistic messages when real messages arrive
    const currentMessageIds = new Set(messages.map(m => m.message.id));
    const newOptimisticMessages = new Map(optimisticMessages);
    let hasChanges = false;

    for (const [tempId, optMessage] of optimisticMessages) {
      // If we find a real message with the same content and timestamp (within 1 second)
      const matchingRealMessage = messages.find(m =>
        m.message.content === optMessage.message.content &&
        Math.abs(new Date(m.message.sentAt).getTime() - new Date(optMessage.message.sentAt).getTime()) < 1000
      );

      if (matchingRealMessage) {
        newOptimisticMessages.delete(tempId);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      setOptimisticMessages(newOptimisticMessages);
    }
  }, [messages]);

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
    if (!ticketId || !user || readonly) return;

    async function markMessagesAsRead() {
      try {
        await fetch(`/api/tickets/${ticketId}/messages/read`, {
          method: 'POST',
          credentials: 'include'
        });
        // Invalidate the unread count query
        queryClient.invalidateQueries({
          queryKey: ['/api/tickets/customer']
        });
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    }

    markMessagesAsRead();
  }, [ticketId, user, readonly, queryClient]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, optimisticMessages]);

  const { data: ticket } = useQuery<Ticket>({
    queryKey: ['/api/tickets', ticketId],
    enabled: !!ticketId,
  });

  const isEmployee = user?.role === 'employee';
  const isBusiness = user?.role === 'business';
  const isCustomer = user?.role === 'customer';

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!isConnected || !ticketId) {
        throw new Error("Not connected to message server");
      }

      let receiverId: number;
      if (isCustomer && ticket) {
        receiverId = ticket.claimedById || ticket.businessId!;
      } else if (ticket) {
        receiverId = ticket.customerId;
      } else {
        throw new Error("Invalid message target");
      }

      const isBroadcast = isCustomer && ticket && !ticket.claimedById;
      const tempId = Date.now();

      const optimisticMessage: Message = {
        message: {
          id: tempId,
          content,
          ticketId,
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

      setOptimisticMessages(prev => {
        const next = new Map(prev);
        next.set(tempId, optimisticMessage);
        return next;
      });

      sendMessage({
        type: 'message',
        senderId: user!.id,
        receiverId,
        content,
        timestamp: new Date().toISOString(),
        ticketId,
        chatInitiator: messages.length === 0,
      });

      return optimisticMessage;
    },
    onError: (error) => {
      setOptimisticMessages(new Map());
      toast({
        variant: "destructive",
        title: "Error sending message",
        description: (error as Error).message
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || readonly || !user || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(newMessage.trim());
    setNewMessage("");
  };

  const allMessages = [...messages, ...Array.from(optimisticMessages.values())];

  const handleTemplateSelect = (template: string) => {
    setNewMessage(template);
  };

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

      {!readonly && (
        <div className="border-t p-4 bg-background mt-auto">
          <form onSubmit={handleSubmit} className="flex gap-2">
            {(isBusiness || isEmployee) && (
              <QuickReplyTemplates onSelectTemplate={handleTemplateSelect} />
            )}
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