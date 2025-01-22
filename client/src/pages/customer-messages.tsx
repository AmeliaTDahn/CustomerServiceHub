import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft, Check, CheckCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";
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

export default function CustomerMessages() {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [hasBusinessMessage, setHasBusinessMessage] = useState(false);
  const queryClient = useQueryClient();
  const { isConnected, sendMessage } = useWebSocket(user?.id, user?.role);

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

  const sendMessageHandler = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !user || !isConnected) return;

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
      sendMessage(message);
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
                </div>
              </ScrollArea>
              <form onSubmit={sendMessageHandler} className="p-4 border-t">
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
                    disabled={!hasBusinessMessage || !isConnected}
                  />
                  <Button
                    type="submit"
                    disabled={!newMessage.trim() || !isConnected || !hasBusinessMessage}
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