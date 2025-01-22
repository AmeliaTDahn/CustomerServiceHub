import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Send, Users, User, Search, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import type { User as UserType } from "@db/schema";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  created_at: string;
}

export default function EmployeeMessages() {
  const customerId = new URLSearchParams(window.location.search).get('customerId');
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [businessSearchTerm, setBusinessSearchTerm] = useState("");
  const queryClient = useQueryClient();
  const { isConnected, sendMessage: sendWebSocketMessage } = useWebSocket(user?.id, user?.role);

  // Fetch customers (only those with tickets)
  const { data: customers = [] } = useQuery<UserType[]>({
    queryKey: ['/api/customers'],
  });

  // Fetch businesses
  const { data: businesses = [] } = useQuery<UserType[]>({
    queryKey: ['/api/businesses'],
  });

  // Filter businesses based on search term
  const filteredBusinesses = businesses.filter(business =>
    business.username.toLowerCase().includes(businessSearchTerm.toLowerCase())
  );

  // Filter customers based on search term
  const filteredCustomers = customers.filter(customer =>
    customer.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Fetch messages for selected user
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['messages', selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const response = await fetch(`/api/messages/${selectedUserId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
    enabled: !!selectedUserId && !!user,
  });

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

    if (!isConnected) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Not connected to message server. Please try again.",
      });
      return;
    }

    try {
      // Send message through WebSocket
      sendWebSocketMessage({
        type: 'message',
        senderId: user.id,
        receiverId: selectedUserId,
        content: message.trim(),
        timestamp: new Date().toISOString()
      });

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
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="h-8 w-8" />
            Message Center
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {!isConnected && (
          <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-yellow-800">Connecting to message server...</p>
          </div>
        )}

        <Tabs defaultValue="customers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="customers" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Customers
            </TabsTrigger>
            <TabsTrigger value="businesses" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Businesses
            </TabsTrigger>
          </TabsList>

          <div className="grid grid-cols-12 gap-4">
            {/* Sidebar */}
            <Card className="col-span-4">
              <CardHeader>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={`Search ${
                      selectedUserId ? "customers" : "businesses"
                    }...`}
                    value={selectedUserId ? searchTerm : businessSearchTerm}
                    onChange={(e) =>
                      selectedUserId
                        ? setSearchTerm(e.target.value)
                        : setBusinessSearchTerm(e.target.value)
                    }
                    className="pl-9"
                  />
                </div>
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

                <TabsContent value="businesses" className="m-0">
                  <div className="divide-y">
                    {filteredBusinesses.map((business) => (
                      <button
                        key={business.id}
                        onClick={() => setSelectedUserId(business.id)}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                          selectedUserId === business.id ? "bg-primary/5" : ""
                        }`}
                      >
                        <p className="font-medium">{business.username}</p>
                        <p className="text-sm text-muted-foreground">Business</p>
                      </button>
                    ))}
                    {filteredBusinesses.length === 0 && businessSearchTerm && (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        No businesses found matching "{businessSearchTerm}"
                      </div>
                    )}
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
                            msg.sender_id === user?.id ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <div
                            className={`rounded-lg px-4 py-2 max-w-[70%] ${
                              msg.sender_id === user?.id
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            <p>{msg.content}</p>
                            <span className="text-xs opacity-70">
                              {new Date(msg.created_at).toLocaleTimeString()}
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