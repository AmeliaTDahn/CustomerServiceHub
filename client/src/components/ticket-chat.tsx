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
      // Filter out any system messages when loading from storage
      return (allMessages[ticketId] || []).filter((msg: Message) => msg.sender !== 'system');
    }
    return [];
  });
  const [newMessage, setNewMessage] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [hasBusinessMessage, setHasBusinessMessage] = useState(false);
  const { user } = useUser();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Check if there's a business message in stored messages
  useEffect(() => {
    const hasBusinessMsg = messages.some(msg => msg.sender !== user?.username);
    setHasBusinessMessage(hasBusinessMsg);
  }, [messages, user?.username]);

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
          if (message.sender !== 'system') {
            setMessages((prev) => [...prev, message]);

            // If it's a business message and customer hasn't received one yet
            if (message.sender !== user?.username && user?.role === 'customer') {
              setHasBusinessMessage(true);
            }

            // Scroll to bottom on new message
            if (scrollAreaRef.current) {
              setTimeout(() => {
                const scrollArea = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
                if (scrollArea) {
                  scrollArea.scrollTop = scrollArea.scrollHeight;
                }
              }, 100);
            }
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

    // If user is a customer and hasn't received a business message yet, prevent sending
    if (user.role === 'customer' && !hasBusinessMessage) {
      toast({
        variant: "destructive",
        title: "Cannot send message",
        description: "Please wait for a business representative to message first.",
      });
      return;
    }

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

  // Check if user is customer and hasn't received a business message
  const isMessageInputDisabled = user?.role === 'customer' && !hasBusinessMessage;

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollAreaRef} className="flex-1 pr-4">
        <div className="space-y-4 min-h-0">
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
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No messages yet
            </p>
          )}
        </div>
      </ScrollArea>
      <form onSubmit={sendMessage} className="pt-4">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={isMessageInputDisabled ? "Wait for business representative to message first..." : "Type your message..."}
            className="flex-1"
            disabled={isMessageInputDisabled}
          />
          <Button 
            type="submit" 
            disabled={!newMessage.trim() || !ws || ws.readyState !== WebSocket.OPEN || isMessageInputDisabled}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}