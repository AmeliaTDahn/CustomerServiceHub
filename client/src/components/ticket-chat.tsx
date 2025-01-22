import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";
import { Loader2, Check, CheckCheck, Lock } from "lucide-react";
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
}

export default function TicketChat({ ticketId, readonly = false, directMessageUserId }: TicketChatProps) {
  const [newMessage, setNewMessage] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const { user } = useUser();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { isConnected, sendMessage, sendReadReceipt } = useWebSocket(user?.id, user?.role);

  // Fetch messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: directMessageUserId 
      ? ['/api/messages/direct', directMessageUserId]
      : ticketId ? ['/api/tickets', ticketId, 'messages'] : [],
    queryFn: async () => {
      if (!directMessageUserId && !ticketId) return [];

      const endpoint = directMessageUserId 
        ? `/api/messages/direct/${directMessageUserId}`
        : `/api/tickets/${ticketId}/messages`;

      const res = await fetch(endpoint, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!(directMessageUserId || ticketId)
  });

  // Fetch ticket details for context
  const { data: ticket } = useQuery<Ticket>({
    queryKey: ['/api/tickets', ticketId],
    enabled: !!ticketId && !directMessageUserId,
  });

  // Check if chat is initiated
  const isChatInitiated = messages.some(msg => msg.message.chatInitiator);
  const isEmployee = user?.role === 'employee';
  const isBusiness = user?.role === 'business';
  const isCustomer = user?.role === 'customer';

  // Determine if user can send messages
  const canSendMessages = () => {
    if (readonly) return false;
    if (directMessageUserId) return true;
    if (isEmployee || isBusiness) return true;
    if (isCustomer) return isChatInitiated;
    return false;
  };

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!isConnected) {
        throw new Error("Not connected to message server");
      }

      // Create optimistic message
      const optimisticMessage: Message = {
        message: {
          id: Date.now(),
          content,
          ticketId: ticketId || null,
          senderId: user!.id,
          receiverId: directMessageUserId || (messages[0]?.sender.id === user!.id 
            ? messages[0]?.message.receiverId 
            : messages[0]?.message.senderId),
          status: 'sending',
          chatInitiator: messages.length === 0 && (isEmployee || isBusiness),
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

      // Add optimistic message to state
      setOptimisticMessages(prev => [...prev, optimisticMessage]);

      // Send through WebSocket
      sendMessage({
        type: 'message',
        senderId: user!.id,
        receiverId: directMessageUserId || (messages[0]?.sender.id === user!.id 
          ? messages[0]?.message.receiverId 
          : messages[0]?.message.senderId),
        content: content,
        timestamp: new Date().toISOString(),
        ticketId: ticketId || undefined,
        directMessageUserId: directMessageUserId,
      });

      return optimisticMessage;
    },
    onSuccess: () => {
      setNewMessage("");
      setOptimisticMessages([]);

      // Invalidate queries to refresh the messages
      if (directMessageUserId) {
        queryClient.invalidateQueries({ queryKey: ['/api/messages/direct', directMessageUserId] });
      } else if (ticketId) {
        queryClient.invalidateQueries({ queryKey: ['/api/tickets', ticketId, 'messages'] });
      }
    },
    onError: (error) => {
      setOptimisticMessages([]);
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message
      });
    }
  });

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || readonly || !user || !canSendMessages()) return;
    sendMessageMutation.mutate(newMessage.trim());
  };

  // Combine real and optimistic messages
  const allMessages = [...messages, ...optimisticMessages];

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="space-y-4 p-4">
          <AnimatePresence initial={false}>
            {!isChatInitiated && isCustomer && (
              <div className="text-center p-4 text-muted-foreground">
                <Lock className="w-4 h-4 mx-auto mb-2" />
                <p>Waiting for support to initiate chat</p>
              </div>
            )}
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
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium">{messageData.sender.username}</p>
                    <span className="text-xs opacity-70">
                      ({messageData.sender.role})
                    </span>
                  </div>
                  <p className="text-sm">{messageData.message.content}</p>
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
        </div>
      </ScrollArea>
      {canSendMessages() && (
        <form onSubmit={handleSubmit} className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={isConnected ? "Type your message..." : "Connecting..."}
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
          </div>
        </form>
      )}
    </div>
  );
}