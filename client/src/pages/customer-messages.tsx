import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { useWebSocket } from "@/hooks/use-websocket";
import { MessageCircle, Search, ArrowLeft, UserCheck, Building2, CircleDot } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TicketChat from "@/components/ticket-chat";
import type { Ticket } from "@db/schema";

interface TicketWithBusiness extends Ticket {
  business: {
    id: number;
    username: string;
  };
  hasBusinessResponse: boolean;
  unreadCount?: number;
  claimedBy?: {
    id: number;
    username: string;
  };
}

export default function CustomerMessages() {
  const ticketId = new URLSearchParams(window.location.search).get('ticketId');
  const { user } = useUser();
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    ticketId ? parseInt(ticketId) : null
  );
  const [selectedBusiness, setSelectedBusiness] = useState<string>('all');
  const { isConnected } = useWebSocket(user?.id, user?.role);
  const queryClient = useQueryClient();

  // Auto-refresh when receiving messages
  useEffect(() => {
    if (isConnected && user) {
      // Invalidate queries when receiving new messages
      return () => {
        queryClient.invalidateQueries({ queryKey: ['/api/tickets/customer'] });
        if (selectedTicketId) {
          queryClient.invalidateQueries({ 
            queryKey: ['/api/tickets', selectedTicketId, 'messages'] 
          });
        }
      };
    }
  }, [isConnected, user, selectedTicketId, queryClient]);

  // Fetch all tickets for the customer with business response status and unread count
  const { data: tickets = [] } = useQuery<TicketWithBusiness[]>({
    queryKey: ['/api/tickets/customer'],
    queryFn: async () => {
      const res = await fetch('/api/tickets/customer', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      const tickets = await res.json();

      // For each ticket, check if there are any business responses and unread messages
      const ticketsWithDetails = await Promise.all(
        tickets.map(async (ticket: TicketWithBusiness) => {
          // Fetch claimed by information if available
          if (ticket.claimedById) {
            const userRes = await fetch(`/api/users/${ticket.claimedById}`, {
              credentials: 'include'
            });
            if (userRes.ok) {
              const userData = await userRes.json();
              ticket.claimedBy = {
                id: userData.id,
                username: userData.username
              };
            }
          }

          const messagesRes = await fetch(`/api/tickets/${ticket.id}/messages`, {
            credentials: 'include'
          });
          if (!messagesRes.ok) throw new Error(await messagesRes.text());
          const messages = await messagesRes.json();

          // Count unread messages and check for business response
          const unreadCount = messages.filter((m: any) =>
            m.message.receiverId === user?.id &&
            m.message.status !== 'read'
          ).length;

          return {
            ...ticket,
            hasBusinessResponse: messages.some((m: any) =>
              m.message.senderId === ticket.business.id ||
              (m.message.senderId !== user?.id && m.message.senderId !== ticket.business.id)
            ),
            unreadCount
          };
        })
      );

      return ticketsWithDetails;
    }
  });

  // Get unique businesses from tickets
  const businesses = Array.from(new Set(tickets.map(ticket => ticket.business.username)));

  // Filter tickets based on selected business
  const filteredTickets = tickets.filter(ticket =>
    selectedBusiness === 'all' || ticket.business.username === selectedBusiness
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

  // Get the selected ticket details
  const selectedTicket = tickets.find(ticket => ticket.id === selectedTicketId);

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
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="h-8 w-8" />
            Message Center
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-16rem)]">
          {/* Sidebar with Tickets */}
          <Card className="col-span-4 flex flex-col">
            <div className="p-4 border-b">
              <Select
                value={selectedBusiness}
                onValueChange={setSelectedBusiness}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by business..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Businesses</SelectItem>
                  {businesses.map((business) => (
                    <SelectItem key={business} value={business}>
                      {business}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                        {!ticket.claimedById && (
                          <CircleDot className="h-3 w-3 text-blue-500" title="Broadcasting to all employees" />
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(ticket.status)}`}>
                        {ticket.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        <p>{ticket.business.username}</p>
                      </div>
                      {ticket.claimedBy && (
                        <p className="text-xs text-blue-600 flex items-center gap-1">
                          <UserCheck className="h-3 w-3" />
                          Claimed by {ticket.claimedBy.username}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                        {ticket.hasBusinessResponse && (
                          <span className="text-green-600">•  New response</span>
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

          {/* Chat Area */}
          <Card className="col-span-8 flex flex-col h-full">
            <CardContent className="p-0 flex-1">
              {selectedTicketId ? (
                <div className="h-full">
                  <div className="p-4 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="font-semibold">{selectedTicket?.title}</h2>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {selectedTicket?.business.username}
                          {!selectedTicket?.claimedById && (
                            <span className="ml-2 text-blue-500 flex items-center gap-1">
                              <CircleDot className="h-3 w-3" />
                              Broadcasting to all employees
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(selectedTicket?.status || '')}`}>
                        {selectedTicket?.status.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                  <TicketChat
                    ticketId={selectedTicketId}
                    readonly={false}
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a ticket to start messaging
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}