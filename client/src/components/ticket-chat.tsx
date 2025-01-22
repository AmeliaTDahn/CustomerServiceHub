import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  const [ws, setWs] = useState<WebSocket | null>(null);
  const { user } = useUser();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const queryClient = useQueryClient();

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

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets', ticketId, 'messages'] });
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

  const connectWebSocket = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?ticketId=${ticketId}`;
      const wsInstance = new WebSocket(wsUrl);

      wsInstance.onopen = () => {
        console.log('WebSocket Connected');
      };

      wsInstance.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          queryClient.invalidateQueries({ queryKey: ['/api/tickets', ticketId, 'messages'] });

          // Scroll to bottom on new message
          if (scrollAreaRef.current) {
            setTimeout(() => {
              const scrollArea = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
              if (scrollArea) {
                scrollArea.scrollTop = scrollArea.scrollHeight;
              }
            }, 100);
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      wsInstance.onerror = (error) => {
        console.error('WebSocket Error:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Connection error. Attempting to reconnect...",
        });
      };

      wsInstance.onclose = () => {
        console.log('WebSocket Disconnected');
        setWs(null);
        // Attempt to reconnect after delay
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      };

      setWs(wsInstance);
      return wsInstance;
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to setup chat connection. Retrying...",
      });
      // Attempt to reconnect after delay
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      return null;
    }
  };

  useEffect(() => {
    if (!readonly) {
      const wsInstance = connectWebSocket();

      return () => {
        if (wsInstance) {
          wsInstance.close();
        }
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
      };
    }
  }, [ticketId, readonly]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || readonly) return;
    sendMessageMutation.mutate(newMessage.trim());
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollAreaRef} className="flex-1">
        <div className="space-y-4 p-4">
          {messages.map((messageData, index) => (
            <div
              key={messageData.message.id}
              className={`flex flex-col ${
                messageData.sender.id === user?.id ? "items-end" : "items-start"
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
                <p className="text-xs opacity-70 mt-1">
                  {new Date(messageData.message.sentAt).toLocaleTimeString()}
                </p>
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
              placeholder="Type your message..."
              className="flex-1"
              disabled={sendMessageMutation.isPending}
            />
            <Button 
              type="submit" 
              disabled={!newMessage.trim() || sendMessageMutation.isPending}
            >
              Send
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}