import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Check, CheckCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@db/schema";

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  status: 'sent' | 'delivered' | 'read';
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export default function BusinessMessages() {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<User | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch all customers
  const { data: customers = [] } = useQuery<User[]>({
    queryKey: ['/api/customers'],
  });

  // Fetch messages for selected customer
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedCustomer?.id],
    enabled: !!selectedCustomer,
  });

  const filteredCustomers = customers?.filter(customer =>
    customer.username.toLowerCase().includes(customerSearchTerm.toLowerCase())
  );

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // WebSocket setup
  useEffect(() => {
    if (!user) return;

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}?userId=${user.id}&role=${user.role}`;
        const wsInstance = new WebSocket(wsUrl);

        wsInstance.onopen = () => {
          toast({
            title: "Connected",
            description: "Message connection established",
          });
        };

        wsInstance.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Handle connection status message
            if (data.type === 'connection') {
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

            // Handle regular message - update messages if it's from/to current selected customer
            if (selectedCustomer && (data.senderId === selectedCustomer.id || data.receiverId === selectedCustomer.id)) {
              queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedCustomer.id] });
            }
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

        wsInstance.onerror = (error) => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Connection error. Attempting to reconnect...",
          });
        };

        wsInstance.onclose = () => {
          setWs(null);
          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
        };

        setWs(wsInstance);
      } catch (error) {
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
  }, [user?.id]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedCustomer || !user || !ws || ws.readyState !== WebSocket.OPEN) return;

    const message = {
      type: "message",
      senderId: user.id,
      receiverId: selectedCustomer.id,
      content: newMessage.trim(),
      timestamp: new Date().toISOString()
    };

    try {
      ws.send(JSON.stringify(message));
      setNewMessage("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message. Please try again.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-2">
        <Link href="/">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-12 gap-4 px-4 h-[calc(100vh-5rem)]">
        {/* Customer List */}
        <Card className="col-span-4 flex flex-col">
          <div className="p-4">
            <Input
              placeholder="Search customers..."
              value={customerSearchTerm}
              onChange={(e) => setCustomerSearchTerm(e.target.value)}
            />
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-2 p-2">
              {filteredCustomers?.map((customer) => (
                <div
                  key={customer.id}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedCustomer?.id === customer.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedCustomer(customer)}
                >
                  <div className="font-medium">{customer.username}</div>
                </div>
              ))}
              {filteredCustomers?.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">
                  No customers found
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Chat Area */}
        <Card className="col-span-8 flex flex-col">
          {selectedCustomer ? (
            <>
              <div className="p-4 border-b">
                <h2 className="font-semibold">{selectedCustomer.username}</h2>
              </div>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages?.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.senderId === user?.id ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                          message.senderId === user?.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm">{message.content}</p>
                        <div className="flex items-center justify-between mt-1 text-xs opacity-70">
                          <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                          {message.senderId === user?.id && (
                            <span className="flex items-center gap-1 ml-2">
                              {message.status === 'sent' && (
                                <Check className="h-3 w-3" />
                              )}
                              {message.status === 'delivered' && (
                                <CheckCheck className="h-3 w-3" />
                              )}
                              {message.status === 'read' && (
                                <CheckCheck className="h-3 w-3 text-blue-500" />
                              )}
                            </span>
                          )}
                        </div>
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
                  <Button type="submit" disabled={!newMessage.trim() || !ws || ws.readyState !== WebSocket.OPEN}>
                    Send
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a customer to start messaging
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}