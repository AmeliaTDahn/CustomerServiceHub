import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { Check, CheckCheck, Search, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import type { Ticket } from "@db/schema";

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
  ticketId: number;
}

interface TicketWithBusiness extends Ticket {
  business: {
    id: number;
    username: string;
  };
}

export default function CustomerMessages() {
  const ticketId = new URLSearchParams(window.location.search).get('ticketId');
  const { user } = useUser();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    ticketId ? parseInt(ticketId) : null
  );
  const [newMessage, setNewMessage] = useState("");
  const { isConnected, sendMessage } = useWebSocket(user?.id, user?.role);

  // Fetch all tickets for the customer
  const { data: tickets = [] } = useQuery<TicketWithBusiness[]>({
    queryKey: ['/api/tickets/customer'],
  });

  // Fetch messages for selected ticket
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/tickets', selectedTicketId, 'messages'],
    enabled: !!selectedTicketId,
  });

  // Filter tickets based on search term
  const filteredTickets = tickets.filter(ticket =>
    ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedTicketId || !user || !isConnected) return;

    const message = {
      type: "message",
      senderId: user.id,
      receiverId: tickets.find(t => t.id === selectedTicketId)?.business.id,
      content: newMessage.trim(),
      timestamp: new Date().toISOString(),
      ticketId: selectedTicketId
    };

    try {
      sendMessage(message);
      setNewMessage("");
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="p-2">
        <Link href="/">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
      <div className="grid grid-cols-12 gap-4 px-4 h-[calc(100vh-5rem)]">
        <Card className="col-span-4 flex flex-col">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="divide-y">
              {filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicketId(ticket.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                    selectedTicketId === ticket.id ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{ticket.title}</p>
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(ticket.status)}`}>
                      {ticket.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    <p>{ticket.business.username}</p>
                    <p>{new Date(ticket.createdAt).toLocaleDateString()}</p>
                  </div>
                </button>
              ))}
              {filteredTickets.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No tickets found
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        <Card className="col-span-8 flex flex-col">
          {selectedTicketId ? (
            <>
              <div className="p-4 border-b">
                <h2 className="font-semibold">
                  {tickets.find(t => t.id === selectedTicketId)?.title}
                </h2>
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
              <form onSubmit={handleSubmit} className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={isConnected ? "Type your message..." : "Connecting..."}
                    className="flex-1"
                    disabled={!isConnected}
                  />
                  <Button
                    type="submit"
                    disabled={!newMessage.trim() || !isConnected}
                  >
                    Send
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select a ticket to start messaging
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}