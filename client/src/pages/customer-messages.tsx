import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSupabase } from "@/components/supabase-provider";
import { useToast } from "@/hooks/use-toast";
import type { Profile } from "@/lib/database.types";

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export default function CustomerMessages() {
  const { user, supabase } = useSupabase();
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [hasBusinessMessage, setHasBusinessMessage] = useState(false);
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch all businesses that have tickets with this customer
  const { data: businesses } = useQuery<Profile[]>({
    queryKey: ['/api/businesses'],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      // First get all tickets for this customer
      const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('business_id')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false });

      if (ticketsError) throw ticketsError;

      // Get unique business IDs
      const businessIds = [...new Set(tickets.map(t => t.business_id))];

      if (businessIds.length === 0) return [];

      // Then get the business profiles
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('id', businessIds)
        .eq('role', 'business');

      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  // Fetch messages for selected business
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedUser?.id],
    enabled: !!selectedUser && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${user?.id},receiver_id.eq.${selectedUser?.id}),and(sender_id.eq.${selectedUser?.id},receiver_id.eq.${user?.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data;
    }
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Check if there's a business message in conversation
  useEffect(() => {
    if (selectedUser && messages.length > 0) {
      const hasBusinessMsg = messages.some(msg => msg.sender_id === selectedUser.id);
      setHasBusinessMessage(hasBusinessMsg);
    } else {
      setHasBusinessMessage(false);
    }
  }, [selectedUser, messages]);

  // WebSocket setup
  useEffect(() => {
    if (!user || !selectedUser) return;

    const connectWebSocket = () => {
      try {
        console.log('Connecting WebSocket...');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/api/ws?userId=${user.id}`;
        const wsInstance = new WebSocket(wsUrl);

        wsInstance.onopen = () => {
          console.log('WebSocket Connected');
          toast({
            title: "Connected",
            description: "Message connection established",
          });
        };

        wsInstance.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Received WebSocket message:', data);

            // Handle connection status message
            if (data.type === 'connection') {
              console.log('Connection status:', data.status);
              return;
            }

            // Handle error message
            if (data.error) {
              toast({
                variant: "destructive",
                title: "Error",
                description: data.error,
              });
              return;
            }

            // Handle regular message
            if (selectedUser && (data.sender_id === selectedUser.id || data.receiver_id === selectedUser.id)) {
              queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedUser.id] });
              if (data.sender_id === selectedUser.id) {
                setHasBusinessMessage(true);
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
          console.log('WebSocket Closed');
          setWs(null);
          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
        };

        setWs(wsInstance);
      } catch (error) {
        console.error('Error setting up WebSocket:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to setup chat connection. Retrying...",
        });
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [user?.id, selectedUser?.id]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !user || !supabase) return;

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          content: newMessage.trim(),
          sender_id: user.id,
          receiver_id: selectedUser.id,
        });

      if (error) throw error;

      setNewMessage("");
      // Invalidate messages query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedUser.id] });
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message. Please try again.",
      });
    }
  };

  const filteredBusinesses = businesses?.filter(business =>
    business.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-2">
        <Link href="/dashboard">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-12 gap-4 px-4 h-[calc(100vh-5rem)]">
        <Card className="col-span-4 flex flex-col">
          <div className="p-4 border-b">
            <Input
              placeholder="Search businesses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {filteredBusinesses?.map((business) => (
                <div
                  key={business.id}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedUser?.id === business.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedUser(business)}
                >
                  <div className="font-medium">{business.company_name || business.username}</div>
                </div>
              ))}
              {filteredBusinesses?.length === 0 && (
                <p className="text-center text-muted-foreground p-4">
                  No businesses found. Create a support ticket first to start messaging.
                </p>
              )}
            </div>
          </ScrollArea>
        </Card>

        <Card className="col-span-8 flex flex-col">
          {selectedUser ? (
            <>
              <div className="p-4 border-b">
                <h2 className="font-semibold">{selectedUser.company_name || selectedUser.username}</h2>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages?.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.sender_id === user?.id ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.sender_id === user?.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm">{message.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {new Date(message.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
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
                  <Button type="submit" disabled={!newMessage.trim()}>
                    Send
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a business to start messaging
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}