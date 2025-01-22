import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
  const { user } = useUser();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Verify that either ticketId or directMessageUserId is provided
  if (!ticketId && !directMessageUserId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">No chat selected</p>
      </div>
    );
  }

  // Fetch messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: directMessageUserId 
      ? ['/api/messages/direct', directMessageUserId]
      : ['/api/tickets', ticketId, 'messages'],
    queryFn: async () => {
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
    refetchInterval: 5000 // Poll every 5 seconds
  });

  // Fetch ticket details if needed
  const { data: ticket } = useQuery<Ticket>({
    queryKey: ['/api/tickets', ticketId],
    enabled: !!ticketId && !directMessageUserId,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollArea = scrollAreaRef.current;
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }, [messages]);

  const isEmployee = user?.role === 'employee';
  const isBusiness = user?.role === 'business';

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const endpoint = directMessageUserId 
        ? `/api/messages/direct/${directMessageUserId}`
        : `/api/tickets/${ticketId}/messages`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ content })
      });

      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (newMessage) => {
      setNewMessage("");

      // Update the messages cache with the new message
      if (directMessageUserId) {
        queryClient.setQueryData<Message[]>(
          ['/api/messages/direct', directMessageUserId],
          (old = []) => [...old, newMessage]
        );
      } else if (ticketId) {
        queryClient.setQueryData<Message[]>(
          ['/api/tickets', ticketId, 'messages'],
          (old = []) => [...old, newMessage]
        );
      }
    },
    onError: (error) => {
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
    if (!newMessage.trim() || readonly || !user) return;
    sendMessageMutation.mutate(newMessage.trim());
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="space-y-4 p-4">
          <AnimatePresence initial={false}>
            {messages?.map((messageData) => (
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
                  <div className="flex items-center justify-end mt-1">
                    <span className="text-xs opacity-70">
                      {new Date(messageData.message.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No messages yet
            </p>
          )}
        </div>
      </ScrollArea>
      {!readonly && (
        <form onSubmit={handleSubmit} className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1"
              disabled={sendMessageMutation.isPending}
            />
            <Button 
              type="submit" 
              disabled={!newMessage.trim() || sendMessageMutation.isPending}
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