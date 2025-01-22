import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { Loader2 } from "lucide-react";
import type { User, Message } from "@db/schema";

export default function MessagesPage() {
  const { user } = useUser();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const queryClient = useQueryClient();
  const { isConnected, sendMessage } = useWebSocket(user?.id, user?.role);

  // Fetch all available users
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users/available'],
  });

  // Fetch messages with selected user
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedUser?.id],
    enabled: !!selectedUser,
  });

  // Handle sending message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !user || !isConnected) return;

    try {
      sendMessage({
        type: 'message',
        senderId: user.id,
        receiverId: selectedUser.id,
        content: newMessage.trim(),
        timestamp: new Date().toISOString(),
      });

      setNewMessage("");
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  // Filter out current user from the list
  const otherUsers = users.filter(u => u.id !== user?.id);

  return (
    <div className="container mx-auto p-4">
      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-2rem)]">
        {/* Users List */}
        <Card className="col-span-4">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Conversations</h2>
          </div>
          <ScrollArea className="h-[calc(100vh-10rem)]">
            <div className="p-2 space-y-2">
              {otherUsers.map((otherUser) => (
                <button
                  key={otherUser.id}
                  onClick={() => setSelectedUser(otherUser)}
                  className={`w-full p-3 text-left rounded-lg transition-colors ${
                    selectedUser?.id === otherUser.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="font-medium">{otherUser.username}</div>
                  <div className="text-sm opacity-70">{otherUser.role}</div>
                </button>
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
                <p className="text-sm text-muted-foreground">
                  {selectedUser.role}
                </p>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((message) => (
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

              <form onSubmit={handleSendMessage} className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    disabled={!isConnected}
                    className="flex-1"
                  />
                  <Button 
                    type="submit" 
                    disabled={!newMessage.trim() || !isConnected}
                  >
                    {!isConnected ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Send"
                    )}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a user to start messaging
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}