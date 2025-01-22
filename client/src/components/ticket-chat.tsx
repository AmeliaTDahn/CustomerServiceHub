import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/use-websocket";

interface Message {
  message: {
    id: number;
    content: string;
    ticketId: number;
    senderId: number;
    receiverId: number;
    status: string;
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
  ticketId: number;
  readonly?: boolean;
}

export default function TicketChat({ ticketId, readonly = false }: TicketChatProps) {
  const [newMessage, setNewMessage] = useState("");
  const { user } = useUser();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { isConnected, sendMessage, sendReadReceipt } = useWebSocket(user?.id, user?.role);

  // Fetch messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/tickets', ticketId, 'messages'],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  // Mark messages as read when viewing
  useEffect(() => {
    if (messages.length > 0 && user) {
      messages.forEach(msg => {
        if (msg.message.receiverId === user.id && msg.message.status !== 'read') {
          sendReadReceipt(msg.message.id);
        }
      });
    }
  }, [messages, user, sendReadReceipt]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!isConnected) {
        throw new Error("Not connected to message server");
      }

      // Send through WebSocket first
      sendMessage({
        type: 'message',
        senderId: user!.id,
        receiverId: messages[0]?.sender.id === user!.id 
          ? messages[0]?.message.receiverId 
          : messages[0]?.message.senderId,
        content: content,
        timestamp: new Date().toISOString(),
        ticketId: ticketId
      });

      return true;
    },
    onSuccess: () => {
      setNewMessage("");
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || readonly || !user) return;
    sendMessageMutation.mutate(newMessage.trim());
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="space-y-4 p-4">
          {messages?.map((messageData) => (
            <div
              key={messageData.message.id}
              className={`flex ${
                messageData.sender.id === user?.id ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  messageData.sender.id === user?.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
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
                    <span className="ml-2">
                      {messageData.message.status === 'sent' && '✓'}
                      {messageData.message.status === 'delivered' && '✓✓'}
                      {messageData.message.status === 'read' && (
                        <span className="text-blue-500">✓✓</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
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
              placeholder={isConnected ? "Type your message..." : "Connecting..."}
              className="flex-1"
              disabled={!isConnected || sendMessageMutation.isPending}
            />
            <Button 
              type="submit" 
              disabled={!newMessage.trim() || !isConnected || sendMessageMutation.isPending}
            >
              Send
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}