import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { User } from "@db/schema";

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  timestamp: string;
}

export default function BusinessMessages() {
  const { user } = useUser();
  const [, setLocation] = useLocation();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newMessage, setNewMessage] = useState("");

  // Fetch all customers
  const { data: customers } = useQuery<User[]>({
    queryKey: ['/api/customers'],
  });

  // Fetch messages for selected user
  const { data: messages } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedUser?.id],
    enabled: !!selectedUser,
  });

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser) return;
    
    // TODO: Implement send message mutation
    setNewMessage("");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
            </div>
            <span className="text-sm text-gray-500">Welcome, {user?.username}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-12rem)]">
          {/* Customer List */}
          <Card className="col-span-4 flex flex-col">
            <div className="p-4 border-b">
              <Input
                placeholder="Search customers..."
                onChange={(e) => {
                  // TODO: Implement customer search
                }}
              />
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {customers?.map((customer) => (
                  <div
                    key={customer.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedUser?.id === customer.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => setSelectedUser(customer)}
                  >
                    <div className="font-medium">{customer.username}</div>
                    {/* Add last message preview here */}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>

          {/* Chat Area */}
          <Card className="col-span-8 flex flex-col">
            {selectedUser ? (
              <>
                <div className="p-4 border-b">
                  <h2 className="font-semibold">{selectedUser.username}</h2>
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
                          <p className="text-xs opacity-70 mt-1">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
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
                Select a customer to start messaging
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
