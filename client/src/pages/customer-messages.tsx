import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Search, ArrowLeft, UserCheck, Lock, Clock, Building2 } from "lucide-react";
import { Link } from "wouter";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  business?: {
    id: number;
    username: string;
  };
}

interface BusinessUser {
  id: number;
  username: string;
  role: 'business';
}

export default function CustomerMessages() {
  const ticketId = new URLSearchParams(window.location.search).get('ticketId');
  const { user } = useUser();
  const [ticketSearchTerm, setTicketSearchTerm] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    ticketId ? parseInt(ticketId) : null
  );
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("tickets");

  // Fetch customer's tickets
  const { data: tickets = [], isLoading } = useQuery<TicketWithClaimInfo[]>({
    queryKey: ['/api/tickets/customer'],
    queryFn: async () => {
      const res = await fetch('/api/tickets/customer', {
        credentials: 'include' // Important for sending auth cookies
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 5000
  });

  // Get the business user for the selected ticket
  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  // Filter tickets based on search term
  const filteredTickets = tickets.filter(ticket =>
    ticket.title.toLowerCase().includes(ticketSearchTerm.toLowerCase()) ||
    (ticket.claimedBy?.username || "").toLowerCase().includes(ticketSearchTerm.toLowerCase())
  );

  const formatClaimTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = Math.abs(now.getTime() - date.getTime()) / 36e5;

    if (diffInHours < 24) {
      return date.toLocaleTimeString();
    }
    return date.toLocaleDateString();
  };

  const handleTicketSelect = (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setSelectedUserId(null);
  };

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
          {/* Sidebar with Tabs */}
          <Card className="col-span-4 flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
              <TabsList className="w-full">
                <TabsTrigger value="tickets" className="flex-1">My Tickets</TabsTrigger>
              </TabsList>

              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tickets..."
                    value={ticketSearchTerm}
                    onChange={(e) => setTicketSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <TabsContent value="tickets" className="flex-1 border-0 m-0 p-0">
                <CardContent className="p-0 flex-1">
                  <ScrollArea className="h-[calc(100vh-15rem)]">
                    <div className="divide-y">
                      {isLoading ? (
                        <div className="p-4 text-sm text-muted-foreground">
                          Loading tickets...
                        </div>
                      ) : filteredTickets.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No tickets found
                        </div>
                      ) : (
                        filteredTickets.map((ticket) => (
                          <button
                            key={ticket.id}
                            onClick={() => handleTicketSelect(ticket.id)}
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
                                  {ticket.business && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Building2 className="h-3 w-3" />
                                      {ticket.business.username}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Badge variant={ticket.status === 'open' ? 'default' : ticket.status === 'in_progress' ? 'default' : 'secondary'}>
                                {ticket.status.replace("_", " ")}
                              </Badge>
                            </div>
                          </button>
                        ))
                      )}
                      {filteredTickets.length === 0 && ticketSearchTerm && (
                        <div className="p-4 text-sm text-muted-foreground">
                          No tickets found matching "{ticketSearchTerm}"
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>

          {/* Chat Area */}
          <Card className="col-span-8 flex flex-col h-full">
            <CardContent className="p-0 flex-1">
              {selectedTicketId ? (
                <div className="h-full">
                  <TicketChat
                    ticketId={selectedTicketId}
                    readonly={false}
                  />
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