import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, ArrowLeft, UserCheck } from "lucide-react";
import { Link } from "wouter";
import TicketChat from "@/components/ticket-chat";
import type { Ticket } from "@db/schema";

interface TicketWithDetails extends Ticket {
  claimedBy?: {
    id: number;
    username: string;
  };
  unreadCount: number;
}

export default function CustomerMessages() {
  const ticketId = new URLSearchParams(window.location.search).get('ticketId');
  const { user } = useUser();
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    ticketId ? parseInt(ticketId) : null
  );

  // Fetch all tickets for the customer
  const { data: tickets = [] } = useQuery<TicketWithDetails[]>({
    queryKey: ['/api/tickets/customer'],
    queryFn: async () => {
      const res = await fetch('/api/tickets/customer', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      const tickets = await res.json();

      // For each ticket, get the claimed employee info and unread count
      const ticketsWithDetails = await Promise.all(
        tickets.map(async (ticket: Ticket) => {
          let claimedBy;
          if (ticket.claimedById) {
            const userRes = await fetch(`/api/users/${ticket.claimedById}`, {
              credentials: 'include'
            });
            if (userRes.ok) {
              const userData = await userRes.json();
              claimedBy = {
                id: userData.id,
                username: userData.username
              };
            }
          }

          // Get messages to count unread
          const messagesRes = await fetch(`/api/tickets/${ticket.id}/messages`, {
            credentials: 'include'
          });
          if (!messagesRes.ok) throw new Error(await messagesRes.text());
          const messages = await messagesRes.json();

          const unreadCount = messages.filter((m: any) =>
            m.message.receiverId === user?.id &&
            m.message.status !== 'read'
          ).length;

          return {
            ...ticket,
            claimedBy,
            unreadCount
          };
        })
      );

      return ticketsWithDetails;
    }
  });

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

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="flex items-center justify-between bg-white shadow px-4 py-2">
        <Link href="/">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Message Center
        </h1>
        <div className="w-[88px]" /> {/* Spacer to center heading */}
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-7rem)]">
          {/* Sidebar with Tickets */}
          <Card className="col-span-4 flex flex-col">
            <CardContent className="p-0 flex-1">
              <ScrollArea className="h-full">
                <div className="divide-y">
                  {tickets.map((ticket) => (
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
                          {ticket.unreadCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs">
                              {ticket.unreadCount}
                            </span>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs ${getStatusColor(ticket.status)}`}>
                          {ticket.status.replace("_", " ")}
                        </span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {ticket.claimedBy ? (
                          <p className="text-xs text-blue-600 flex items-center gap-1">
                            <UserCheck className="h-3 w-3" />
                            Assigned to {ticket.claimedBy.username}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Waiting for assignment
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(ticket.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                  ))}
                  {tickets.length === 0 && (
                    <div className="px-4 py-3 text-sm text-muted-foreground">
                      No tickets found
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Chat Area */}
          <Card className="col-span-8 flex flex-col h-full">
            <CardContent className="p-0 flex-1">
              {selectedTicketId ? (
                <TicketChat
                  ticketId={selectedTicketId}
                  readonly={false}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a ticket to view messages
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}