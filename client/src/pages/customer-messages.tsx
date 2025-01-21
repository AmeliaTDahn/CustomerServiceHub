import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
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

export default function CustomerMessages() {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [hasBusinessMessage, setHasBusinessMessage] = useState(false);
  const queryClient = useQueryClient();

  // Fetch all businesses
  const { data: businesses } = useQuery<User[]>({
    queryKey: ['/api/businesses'],
  });

  // Fetch messages for selected user
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedUser?.id],
    enabled: !!selectedUser,
  });

  const filteredBusinesses = businesses?.filter(business =>
    business.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Check if there's a business message in conversation
  useEffect(() => {
    if (selectedUser && messages.length > 0) {
      const hasBusinessMsg = messages.some(msg => msg.senderId === selectedUser.id);
      setHasBusinessMessage(hasBusinessMsg);
    } else {
      setHasBusinessMessage(false);
    }
  }, [selectedUser, messages]);

  // WebSocket setup
  useEffect(() => {
    if (!user || !selectedUser) return;

    let reconnectTimeout: NodeJS.Timeout;
    const connectWebSocket = () => {
      console.log('Connecting WebSocket...');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}?userId=${user.id}&role=${user.role}`;
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
          if (data.senderId === selectedUser.id || data.receiverId === selectedUser.id) {
            queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedUser.id] });
            if (data.senderId === selectedUser.id) {
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
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };

      setWs(wsInstance);
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
      }
    };
  }, [user?.id, selectedUser?.id]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !user || !ws || ws.readyState !== WebSocket.OPEN) return;

    // Check if customer can send message
    if (!hasBusinessMessage) {
      toast({
        variant: "destructive",
        title: "Cannot send message",
        description: "Please wait for the business to message you first.",
      });
      return;
    }

    const message = {
      type: "message",
      senderId: user.id,
      receiverId: selectedUser.id,
      content: newMessage.trim(),
      timestamp: new Date().toISOString()
    };

    try {
      console.log('Sending message:', message);
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
    <div className="min-h-screen">
      <div className="p-2">
        <Link href="/">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-12 gap-4 px-4 h-[calc(100vh-5rem)] bg-gray-50">
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
                  <div className="font-medium">{business.username}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        <Card className="col-span-8 flex flex-col">
          {selectedUser ? (
            <>
              <div className="p-4 border-b">
                <h2 className="font-semibold">{selectedUser.username}</h2>
                {!hasBusinessMessage && (
                  <p className="text-sm text-muted-foreground">
                    Wait for business to initiate the conversation
                  </p>
                )}
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
                    placeholder={
                      hasBusinessMessage
                        ? "Type your message..."
                        : "Wait for business to message first..."
                    }
                    className="flex-1"
                    disabled={!hasBusinessMessage}
                  />
                  <Button
                    type="submit"
                    disabled={!newMessage.trim() || !ws || ws.readyState !== WebSocket.OPEN || !hasBusinessMessage}
                  >
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