import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, ArrowLeft, UserCheck, Lock, Clock } from "lucide-react";
import { Link } from "wouter";
import TicketChat from "@/components/ticket-chat";
import type { Ticket } from "@db/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface TicketWithClaimInfo extends Ticket {
  claimedBy?: {
    id: number;
    username: string;
  };
  claimedAt?: string;
}

export default function CustomerMessages() {
  const ticketId = new URLSearchParams(window.location.search).get('ticketId');
  const { user } = useUser();
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    ticketId ? parseInt(ticketId) : null
  );

  // Fetch customer's tickets
  const { data: tickets = [], isLoading } = useQuery<TicketWithClaimInfo[]>({
    queryKey: ['/api/tickets/customer'],
    queryFn: async () => {
      const res = await fetch('/api/tickets/customer', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      const tickets = await res.json();

      // Get claiming employee info for each ticket
      const ticketsWithClaimInfo = await Promise.all(
        tickets.map(async (ticket: Ticket) => {
          let claimedBy;
          let claimedAt;
          if (ticket.claimedById) {
            const userRes = await fetch(`/api/users/${ticket.claimedById}`, {
              credentials: 'include'
            });
            if (userRes.ok) {
              claimedBy = await userRes.json();
              claimedAt = ticket.updatedAt; // Using updatedAt as claimedAt timestamp
            }
          }
          return { ...ticket, claimedBy, claimedAt };
        })
      );

      return ticketsWithClaimInfo;
    },
    refetchInterval: 5000
  });

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return "bg-green-100 text-green-800";
      case 'in_progress':
        return "bg-blue-100 text-blue-800";
      case 'resolved':
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatClaimTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.abs(now.getTime() - date.getTime()) / 36e5;

    if (diffInHours < 24) {
      return date.toLocaleTimeString();
    }
    return date.toLocaleDateString();
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
          Support Messages
        </h1>
        <div className="w-[88px]" /> {/* Spacer */}
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-7rem)]">
          {/* Ticket List Sidebar */}
          <Card className="col-span-4 flex flex-col">
            <CardContent className="p-0 flex-1">
              <ScrollArea className="h-full">
                <div className="divide-y">
                  {isLoading ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      Loading tickets...
                    </div>
                  ) : tickets.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No support tickets found. Create a ticket from the dashboard to get help.
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                          selectedTicketId === ticket.id ? "bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p className="font-medium">{ticket.title}</p>
                            <div className="mt-1.5 flex flex-col gap-1">
                              {ticket.claimedBy ? (
                                <>
                                  <Badge variant="secondary" className="w-fit flex items-center gap-1 bg-blue-50 text-blue-700 hover:bg-blue-50">
                                    <UserCheck className="h-3 w-3" />
                                    Claimed by {ticket.claimedBy.username}
                                  </Badge>
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Claimed {formatClaimTime(ticket.claimedAt!)}
                                  </p>
                                </>
                              ) : (
                                <Badge variant="secondary" className="w-fit flex items-center gap-1 bg-gray-50 text-gray-600 hover:bg-gray-50">
                                  <Lock className="h-3 w-3" />
                                  Waiting for claim
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Badge variant={ticket.status === 'open' ? 'success' : ticket.status === 'in_progress' ? 'default' : 'secondary'}>
                            {ticket.status.replace("_", " ")}
                          </Badge>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Chat Area */}
          <Card className="col-span-8 flex flex-col h-full">
            <CardContent className="p-0 flex-1">
              {selectedTicketId ? (
                <div className="h-full">
                  {selectedTicket?.claimedById ? (
                    <TicketChat
                      ticketId={selectedTicketId}
                      readonly={false}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center p-4">
                      <Alert>
                        <AlertDescription className="flex items-center gap-2 text-muted-foreground">
                          <Lock className="h-4 w-4" />
                          This ticket hasn't been claimed by an employee yet. 
                          You'll be able to chat once an employee is assigned.
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}
                </div>
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