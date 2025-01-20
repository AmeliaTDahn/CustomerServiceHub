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

export default function TicketChat({ ticketId }: TicketChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const { user } = useUser();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let wsInstance: WebSocket;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}?ticketId=${ticketId}&role=${user?.role}`;
      wsInstance = new WebSocket(wsUrl);

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
          description: "Failed to connect to chat. Please try again.",
        });
      };

      wsInstance.onclose = () => {
        console.log('WebSocket Disconnected');
        toast({
          variant: "destructive",
          title: "Disconnected",
          description: "Chat connection lost. Please refresh to reconnect.",
        });
      };

      setWs(wsInstance);

      return () => {
        wsInstance.close();
      };
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to setup chat connection.",
      });
    }
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