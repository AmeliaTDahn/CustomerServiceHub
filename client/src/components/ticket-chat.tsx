import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { supabase } from "@/lib/supabase";

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
  const [hasBusinessMessage, setHasBusinessMessage] = useState(false);
  const { user } = useUser();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Subscribe to new messages
    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on('INSERT', { event: 'messages' }, ({ new: message }) => {
        setMessages(prev => [...prev, message]);
        if (message.sender !== user?.username) {
          setHasBusinessMessage(true);
        }
      })
      .subscribe();

    // Load existing messages
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('ticketId', ticketId)
        .order('timestamp', { ascending: true });

      if (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load messages",
        });
        return;
      }

      setMessages(data);
      setHasBusinessMessage(data.some(msg => msg.sender !== user?.username));
    };

    loadMessages();
    return () => {
      channel.unsubscribe();
    };
  }, [ticketId, user?.username]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    const message = {
      ticketId,
      sender: user.username,
      content: newMessage.trim(),
      timestamp: new Date().toISOString()
    };

    const { error } = await supabase
      .from('messages')
      .insert(message);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message",
      });
      return;
    }

    setNewMessage("");
  };

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
        </div>
      </ScrollArea>
      <form onSubmit={sendMessage} className="pt-4">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={
              hasBusinessMessage
                ? "Type your message..."
                : "Wait for business representative to message first..."
            }
            className="flex-1"
            disabled={!hasBusinessMessage}
          />
          <Button 
            type="submit" 
            disabled={!newMessage.trim() || !hasBusinessMessage}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}