import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

interface Message {
  ticketId: number;
  sender: string;
  content: string;
  timestamp: string;
}

interface TicketChatProps {
  ticketId: number;
}

const STORAGE_KEY = 'ticket-chat-messages';
const RECONNECT_DELAY = 3000; // 3 seconds

export default function TicketChat({ ticketId }: TicketChatProps) {
  const [messages, setMessages] = useState<Message[]>(() => {
    // Load messages from localStorage on component mount
    const storedMessages = localStorage.getItem(STORAGE_KEY);
    if (storedMessages) {
      const allMessages = JSON.parse(storedMessages);
      return allMessages[ticketId] || [];
    }
    return [];
  });
  const [newMessage, setNewMessage] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const { user } = useUser();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Save messages to localStorage whenever they change
  useEffect(() => {
    const storedMessages = localStorage.getItem(STORAGE_KEY);
    const allMessages = storedMessages ? JSON.parse(storedMessages) : {};
    allMessages[ticketId] = messages;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allMessages));
  }, [messages, ticketId]);

  const connectWebSocket = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}?ticketId=${ticketId}&role=${user?.role}`;
      const wsInstance = new WebSocket(wsUrl);

      wsInstance.onopen = () => {
        console.log('WebSocket Connected');
        toast({
          title: "Connected",
          description: "Chat connection established",
        });
      };

      wsInstance.onmessage = (event) => {
        try {
          const message: Message = JSON.parse(event.data);
          setMessages((prev) => [...prev, message]);

          // Scroll to bottom on new message
          if (scrollAreaRef.current) {
            setTimeout(() => {
              scrollAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, RECONNECT_DELAY);
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
      reconnectTimeoutRef.current = setTimeout(connectWebSocket, RECONNECT_DELAY);
      return null;
    }
  };

  useEffect(() => {
    const wsInstance = connectWebSocket();

    return () => {
      if (wsInstance) {
        wsInstance.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [ticketId, user?.role]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !ws || ws.readyState !== WebSocket.OPEN || !user) return;

    const message: Message = {
      ticketId,
      sender: user.username,
      content: newMessage.trim(),
      timestamp: new Date().toISOString()
    };

    try {
      ws.send(JSON.stringify(message));
      setMessages((prev) => [...prev, message]);
      setNewMessage("");
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message. Please try again.",
      });
    }
  };

  return (
    <div className="flex flex-col h-[400px] border rounded-lg">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex flex-col ${
                message.sender === user?.username ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.sender === user?.username
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm font-medium mb-1">{message.sender}</p>
                <p className="text-sm">{message.content}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          <div ref={scrollAreaRef} />
        </div>
      </ScrollArea>
      <form onSubmit={sendMessage} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1"
          />
          <Button type="submit" disabled={!newMessage.trim() || !ws || ws.readyState !== WebSocket.OPEN}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}