import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Send, Users, User } from "lucide-react";
import type { User as UserType } from "@db/schema";
import { useToast } from "@/hooks/use-toast";
import { initializeWebSocket, getWebSocketClient } from "@/lib/websocket";

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  timestamp: string;
}

export default function EmployeeMessages() {
  const customerId = new URLSearchParams(window.location.search).get('customerId');
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  // Fetch customers (only those with tickets)
  const { data: customers = [] } = useQuery<UserType[]>({
    queryKey: ['/api/customers'],
  });

  // Fetch employees and business users
  const { data: employees = [] } = useQuery<UserType[]>({
    queryKey: ['/api/employees'],
  });

  // Get the business account separately
  const { data: businesses = [] } = useQuery<UserType[]>({
    queryKey: ['/api/businesses'],
  });

  // Combine employees and business accounts
  const allStaff = [...employees, ...businesses];

  // Filter users based on search term
  const filteredCustomers = customers.filter(customer =>
    customer.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredStaff = allStaff.filter(staff =>
    staff.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fetch messages
  const { data: messages = [], isError, error } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedUserId],
    queryFn: async () => {
      if (!selectedUserId || !user) return [];
      const response = await fetch(`/api/messages/${selectedUserId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      return response.json();
    },
    enabled: !!selectedUserId && !!user,
  });

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user) return;

    try {
      console.log('Setting up WebSocket connection...');
      const wsClient = initializeWebSocket(user.id, user.role, toast);

      const unsubscribe = wsClient.onMessage((message) => {
        // Only update messages if they're related to the current conversation
        if (message.senderId === selectedUserId || message.receiverId === selectedUserId) {
          console.log('Received message for current conversation:', message);
          queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedUserId] });

          // Show notification for new messages
          if (message.senderId !== user.id) {
            toast({
              title: "New Message",
              description: "You have received a new message",
            });
          }
        }
      });

      return () => {
        console.log('Cleaning up WebSocket connection...');
        unsubscribe();
      };
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: error instanceof Error ? error.message : "Failed to connect to messaging service",
      });
    }
  }, [user, selectedUserId, queryClient, toast]);

  // When loading the page with a customerId, find and select that customer
  useEffect(() => {
    if (customerId && customers.length > 0) {
      const customer = customers.find(c => c.id === parseInt(customerId));
      if (customer) {
        setSelectedUserId(customer.id);
      }
    }
  }, [customerId, customers]);

  const handleSendMessage = async () => {
    if (!selectedUserId || !message.trim() || !user) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a user and enter a message.",
      });
      return;
    }

    try {
      console.log('Attempting to send message:', {
        senderId: user.id,
        receiverId: selectedUserId,
        content: message
      });

      const wsClient = getWebSocketClient();
      wsClient.sendMessage(selectedUserId, message.trim());
      setMessage("");
    } catch (error) {
      console.error('Failed to send message:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message. Please try again.",
      });
    }
  };

  if (isError) {
    toast({
      variant: "destructive",
      title: "Error",
      description: error instanceof Error ? error.message : "Failed to load messages",
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="h-8 w-8" />
            Message Center
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <Tabs defaultValue="customers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="customers" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Customers
            </TabsTrigger>
            <TabsTrigger value="employees" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Employees & Business
            </TabsTrigger>
          </TabsList>

          <div className="grid grid-cols-12 gap-4">
            {/* Sidebar */}
            <Card className="col-span-4">
              <CardHeader>
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </CardHeader>
              <CardContent className="p-0">
                <TabsContent value="customers" className="m-0">
                  <div className="divide-y">
                    {filteredCustomers.map((customer) => (
                      <button
                        key={customer.id}
                        onClick={() => setSelectedUserId(customer.id)}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                          selectedUserId === customer.id ? "bg-primary/5" : ""
                        }`}
                      >
                        <p className="font-medium">{customer.username}</p>
                        <p className="text-sm text-muted-foreground">Customer</p>
                      </button>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="employees" className="m-0">
                  <div className="divide-y">
                    {filteredStaff.map((staff) => (
                      <button
                        key={staff.id}
                        onClick={() => setSelectedUserId(staff.id)}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                          selectedUserId === staff.id ? "bg-primary/5" : ""
                        }`}
                      >
                        <p className="font-medium">{staff.username}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {staff.role}
                        </p>
                      </button>
                    ))}
                  </div>
                </TabsContent>
              </CardContent>
            </Card>

            {/* Chat Area */}
            <Card className="col-span-8">
              <CardContent className="p-0">
                {selectedUserId ? (
                  <div className="flex flex-col h-[600px]">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.senderId === user?.id ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <div
                            className={`rounded-lg px-4 py-2 max-w-[70%] ${
                              msg.senderId === user?.id
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            <p>{msg.content}</p>
                            <span className="text-xs opacity-70">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t p-4">
                      <div className="flex gap-2">
                        <Input
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder="Type your message..."
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                        />
                        <Button onClick={handleSendMessage}>
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[600px] flex items-center justify-center text-muted-foreground">
                    Select a user to start messaging
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </Tabs>
      </main>
    </div>
  );
}