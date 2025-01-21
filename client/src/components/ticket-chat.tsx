import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { supabase } from "@/lib/supabase";

interface Message {
  id: number;
  ticketId: number;
  content: string;
  senderId: number;
  senderType: string;
  createdAt: string;
}

interface TicketChatProps {
  ticketId: number;
}

export default function TicketChat({ ticketId }: TicketChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const { user } = useUser();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    // Load existing messages
    const loadMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('ticketId', ticketId)
          .order('createdAt', { ascending: true });

        if (error) throw error;
        setMessages(data || []);
      } catch (error) {
        console.error('Error loading messages:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load messages. Please try refreshing the page."
        });
      }
    };

    loadMessages();

    // Set up real-time subscription
    const channel = supabase.channel(`ticket-${ticketId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `ticketId=eq.${ticketId}`
      }, (payload) => {
        const newMessage = payload.new as Message;
        setMessages(prev => [...prev, newMessage]);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to ticket-${ticketId} messages`);
        } else if (status === 'CLOSED') {
          console.log(`Subscription to ticket-${ticketId} closed`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Error in ticket-${ticketId} subscription`);
          toast({
            variant: "destructive",
            title: "Connection Error",
            description: "Lost connection to chat. Please refresh the page."
          });
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
  }, [ticketId, toast]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    try {
      const message = {
        ticketId,
        content: newMessage.trim(),
        senderId: user.id,
        senderType: user.role,
        createdAt: new Date().toISOString()
      };

      const { error } = await supabase
        .from('messages')
        .insert(message);

      if (error) throw error;

      setNewMessage("");
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message. Please try again."
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <ScrollArea ref={scrollAreaRef} className="flex-1 pr-4">
        <div className="space-y-4 min-h-0">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col ${
                message.senderId === user?.id ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  message.senderId === user?.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm font-medium mb-1">
                  {message.senderType === user?.role ? "You" : message.senderType}
                </p>
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(message.createdAt).toLocaleTimeString()}
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
            placeholder="Type your message..."
            className="flex-1"
          />
          <Button 
            type="submit" 
            disabled={!newMessage.trim()}
          >
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}