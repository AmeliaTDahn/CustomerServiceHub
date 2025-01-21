import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { supabase } from "@/lib/supabase";
import type { Message } from "@db/schema";

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
      scrollAreaRef.current.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    // Load existing messages
    const loadMessages = async () => {
      try {
        const response = await fetch(`/api/tickets/${ticketId}/chat`, {
          credentials: 'include'
        });

        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        console.log('Loaded messages:', data);
        setMessages(data);
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
    const channel = supabase.channel(`ticket:${ticketId}`, {
      config: {
        broadcast: { self: true },
        presence: { key: user?.id.toString() },
      }
    })
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `ticket_id=eq.${ticketId}`
    }, (payload) => {
      console.log('Received new message:', payload);
      const newMessage = payload.new as Message;
      setMessages(prev => [...prev, newMessage]);
    })
    .subscribe(async (status) => {
      console.log(`Channel status for ticket:${ticketId}:`, status);
      if (status === 'SUBSCRIBED') {
        console.log(`Successfully subscribed to ticket:${ticketId}`);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`Error in ticket:${ticketId} subscription`);
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
        console.log('Unsubscribing from channel');
        channelRef.current.unsubscribe();
      }
    };
  }, [ticketId, toast, user?.id]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    try {
      const response = await fetch(`/api/tickets/${ticketId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: newMessage.trim()
        }),
        credentials: 'include'
      });

      if (!response.ok) throw new Error(await response.text());

      setNewMessage("");
      console.log('Message sent successfully');
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