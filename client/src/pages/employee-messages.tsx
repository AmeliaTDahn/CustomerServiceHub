import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Send, Users, User } from "lucide-react";
import type { Message, User as UserType } from "@db/schema";

export default function EmployeeMessages() {
  const customerId = new URLSearchParams(window.location.search).get('customerId');
  const { user } = useUser();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Fetch conversations
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedUserId],
    enabled: !!selectedUserId,
  });

  // Fetch customers
  const { data: customers = [] } = useQuery<UserType[]>({
    queryKey: ['/api/customers'],
  });

  // Fetch employees and business users
  const { data: employees = [] } = useQuery<UserType[]>({
    queryKey: ['/api/employees'],
  });

  // Filter users based on search term
  const filteredCustomers = customers.filter(customer =>
    customer.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredEmployees = employees.filter(employee =>
    employee.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // When loading the page with a customerId, find and select that customer
  useState(() => {
    if (customerId && customers.length > 0) {
      const customer = customers.find(c => c.id === parseInt(customerId));
      if (customer) {
        setSelectedUserId(customer.id);
      }
    }
  }, [customerId, customers]);

  const sendMessage = async () => {
    if (!selectedUserId || !message.trim()) return;

    try {
      const response = await fetch(`/api/messages/${selectedUserId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: message }),
        credentials: 'include',
      });

      if (!response.ok) throw new Error(await response.text());

      setMessage("");
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

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
                    {filteredEmployees.map((employee) => (
                      <button
                        key={employee.id}
                        onClick={() => setSelectedUserId(employee.id)}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                          selectedUserId === employee.id ? "bg-primary/5" : ""
                        }`}
                      >
                        <p className="font-medium">{employee.username}</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {employee.role}
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
                              {new Date(msg.createdAt).toLocaleTimeString()}
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
                              sendMessage();
                            }
                          }}
                        />
                        <Button onClick={sendMessage}>
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