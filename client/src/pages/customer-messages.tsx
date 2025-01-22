import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { Check, CheckCheck, Search, ArrowLeft, Lock } from "lucide-react";
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
  hasBusinessResponse: boolean;
  unreadCount?: number;
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
  const queryClient = useQueryClient();

  // Auto-refresh tickets when WebSocket receives a message
  useEffect(() => {
    const ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}?userId=${user?.id}&role=${user?.role}`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'message' && data.receiverId === user?.id) {
          // Invalidate tickets query to refresh the list
          queryClient.invalidateQueries({ queryKey: ['/api/tickets/customer'] });

          // If this is a new ticket and no ticket is selected, select it
          if (!selectedTicketId && data.ticketId) {
            setSelectedTicketId(data.ticketId);
          }
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, [user?.id, user?.role, selectedTicketId, queryClient]);

  // Fetch all tickets for the customer with business response status and unread count
  const { data: tickets = [] } = useQuery<TicketWithBusiness[]>({
    queryKey: ['/api/tickets/customer'],
    queryFn: async () => {
      const res = await fetch('/api/tickets/customer');
      if (!res.ok) throw new Error(await res.text());
      const tickets = await res.json();

      // For each ticket, check if there are any business responses and unread messages
      const ticketsWithDetails = await Promise.all(
        tickets.map(async (ticket: TicketWithBusiness) => {
          const messagesRes = await fetch(`/api/tickets/${ticket.id}/messages`);
          const messages = await messagesRes.json();

          // Count unread messages
          const unreadCount = messages.filter((m: Message) =>
            m.receiverId === user?.id &&
            m.status !== 'read'
          ).length;

          return {
            ...ticket,
            hasBusinessResponse: messages.some((m: Message) =>
              m.senderId === ticket.business.id ||
              (m.senderId !== user?.id && m.senderId !== ticket.business.id)
            ),
            unreadCount
          };
        })
      );

      return ticketsWithDetails;
    }
  });

  // Fetch messages for selected ticket
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/tickets', selectedTicketId, 'messages'],
    enabled: !!selectedTicketId,
  });

  // Filter tickets based on search term
  const filteredTickets = tickets.filter(ticket =>
    ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.business.username.toLowerCase().includes(searchTerm.toLowerCase())
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

    const selectedTicket = tickets.find(t => t.id === selectedTicketId);
    if (!selectedTicket?.hasBusinessResponse) return;

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

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);
  const canSendMessage = selectedTicket?.hasBusinessResponse;

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
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Support Tickets</h1>
          <p className="mt-1 text-sm text-gray-500">View and manage your support tickets</p>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4 px-4 h-[calc(100vh-12rem)] max-w-7xl mx-auto w-full mt-6">
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
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{ticket.title}</p>
                      {ticket.unreadCount ? (
                        <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs">
                          {ticket.unreadCount}
                        </span>
                      ) : null}
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${getStatusColor(ticket.status)}`}>
                      {ticket.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    <p className="text-sm text-muted-foreground">
                      {ticket.business.username}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                      {!ticket.hasBusinessResponse && (
                        <span className="flex items-center gap-1 text-yellow-600">
                          <Lock className="h-3 w-3" />
                          Awaiting response
                        </span>
                      )}
                    </div>
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
          {selectedTicketId && selectedTicket ? (
            <>
              <div className="p-4 border-b">
                <h2 className="font-semibold text-lg">
                  {selectedTicket.title}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm text-muted-foreground">
                    {selectedTicket.business.username}
                  </p>
                  {!selectedTicket.hasBusinessResponse && (
                    <span className="flex items-center gap-1 text-xs text-yellow-600">
                      <Lock className="h-3 w-3" />
                      Waiting for business to respond
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedTicket.description}
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
                    placeholder={
                      !canSendMessage
                        ? "Waiting for business to respond first..."
                        : isConnected
                          ? "Type your message..."
                          : "Connecting..."
                    }
                    className="flex-1"
                    disabled={!isConnected || !canSendMessage}
                  />
                  <Button
                    type="submit"
                    disabled={!newMessage.trim() || !isConnected || !canSendMessage}
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