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
}

interface MessageHeader {
  username: string;
  role: string;
  isBroadcast?: boolean;
}

const MessageHeader = ({ username, role, isBroadcast }: MessageHeader) => (
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

export default function TicketChat({ ticketId, readonly = false, directMessageUserId }: TicketChatProps) {
  const [newMessage, setNewMessage] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const { user } = useUser();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { isConnected, sendMessage } = useWebSocket(user?.id, user?.role);

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
    enabled: !!(directMessageUserId || ticketId),
    refetchInterval: 5000
  });

  const { data: ticket } = useQuery<Ticket>({
    queryKey: ['/api/tickets', ticketId],
    enabled: !!ticketId && !directMessageUserId,
  });

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollArea = scrollAreaRef.current;
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [messages, optimisticMessages]);

  const isEmployee = user?.role === 'employee';
  const isBusiness = user?.role === 'business';
  const isCustomer = user?.role === 'customer';

  const canSendMessages = () => {
    if (readonly) return false;
    if (directMessageUserId) return true;
    if (isEmployee || isBusiness) return true;
    if (isCustomer && ticketId) return true;
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
        chatInitiator: messages.length === 0,
      });

      return optimisticMessage;
    },
    onSuccess: () => {
      setNewMessage("");

      if (directMessageUserId) {
        queryClient.invalidateQueries({
          queryKey: ['/api/messages/direct', directMessageUserId]
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
      {!readonly && ticket && !ticket.claimedById && user?.role === 'customer' && (
        <div className="bg-blue-50 text-blue-700 px-4 py-2 text-sm flex items-center gap-2">
          <Megaphone className="h-4 w-4" />
          This ticket is unclaimed. Your messages will be broadcast to all available employees.
        </div>
      )}
      <div className={cn(
        "absolute inset-0",
        !readonly && "bottom-[4.5rem]",
        !readonly && ticket && !ticket.claimedById && user?.role === 'customer' && "top-[2.5rem]"
      )}>
        <ScrollArea
          ref={scrollAreaRef}
          className="h-full relative scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
        >
          <div className="space-y-4 p-4 pb-6">
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
          </div>
        </ScrollArea>
      </div>

      {canSendMessages() && (
        <div className="absolute bottom-0 left-0 right-0 bg-background border-t">
          <form onSubmit={handleSubmit} className="p-4">
            <div className="flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={
                  isConnected
                    ? `Type your message${!ticket?.claimedById && user?.role === 'customer' ? ' (will be broadcast to all employees)' : ''}...`
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
            </div>
          </form>
        </div>
      )}
    </div>
  );
}