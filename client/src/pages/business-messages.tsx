import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@db/schema";

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  createdAt: string;
}

export default function BusinessMessages() {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const queryClient = useQueryClient();

  // Fetch all customers
  const { data: customers } = useQuery<User[]>({
    queryKey: ['/api/customers'],
  });

  // Fetch messages for selected user
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedUser?.id],
    enabled: !!selectedUser,
  });

  const filteredCustomers = customers?.filter(customer =>
    customer.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // WebSocket setup
  useEffect(() => {
    if (!user || !selectedUser) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?userId=${user.id}`;
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
        const message: Message = JSON.parse(event.data);
        if (message.senderId === selectedUser.id || message.receiverId === selectedUser.id) {
          queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedUser.id] });
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
        description: "Connection error. Please try again.",
      });
    };

    setWs(wsInstance);

    return () => {
      wsInstance.close();
    };
  }, [user?.id, selectedUser?.id]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !user || !ws || ws.readyState !== WebSocket.OPEN) return;

    const message = {
      senderId: user.id,
      receiverId: selectedUser.id,
      content: newMessage.trim(),
      timestamp: new Date().toISOString()
    };

    try {
      ws.send(JSON.stringify(message));
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
    <div className="min-h-screen grid grid-cols-12 gap-6 p-6 bg-gray-50">
      {/* Customer List */}
      <Card className="col-span-4 flex flex-col">
        <div className="p-4 border-b">
          <Input
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {filteredCustomers?.map((customer) => (
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
                        {new Date(message.createdAt).toLocaleTimeString()}
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
  );
}