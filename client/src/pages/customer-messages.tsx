import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Search, ArrowLeft, Building2, Clock, Plus } from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import TicketChat from "@/components/ticket-chat";
import TicketFeedback from "@/components/ticket-feedback";
import TicketForm from "@/components/ticket-form";
import type { Ticket } from "@db/schema";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface TicketWithInfo extends Ticket {
  business?: {
    id: number;
    username: string;
  };
  hasBusinessResponse: boolean;
  unreadCount: number;
  hasFeedback?: boolean;
}

export default function CustomerMessages() {
  const ticketId = new URLSearchParams(window.location.search).get('ticketId');
  const { user } = useUser();
  const [ticketSearchTerm, setTicketSearchTerm] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    ticketId ? parseInt(ticketId) : null
  );
  const [activeTab, setActiveTab] = useState<string>("active");
  const [isNewTicketDialogOpen, setIsNewTicketDialogOpen] = useState(false);

  // Fetch customer's tickets
  const { data: tickets = [], isLoading } = useQuery<TicketWithInfo[]>({
    queryKey: ['/api/tickets/customer'],
    queryFn: async () => {
      const res = await fetch('/api/tickets/customer', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    refetchInterval: 5000
  });

  // Get the selected ticket
  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  // Filter tickets based on search term and status
  const filteredTickets = tickets.filter(ticket =>
    (ticket.title.toLowerCase().includes(ticketSearchTerm.toLowerCase()) ||
    (ticket.business?.username || "").toLowerCase().includes(ticketSearchTerm.toLowerCase())) &&
    (activeTab === "active" ? ticket.status !== "resolved" : ticket.status === "resolved")
  );

  const handleTicketSelect = (ticketId: number) => {
    setSelectedTicketId(ticketId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
        <Button
          size="sm"
          onClick={() => setIsNewTicketDialogOpen(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Ticket
        </Button>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-7rem)]">
          {/* Sidebar with Tabs */}
          <Card className="col-span-4 flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
              <TabsList className="w-full">
                <TabsTrigger value="active" className="flex-1">Active Tickets</TabsTrigger>
                <TabsTrigger value="resolved" className="flex-1">Resolved</TabsTrigger>
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

              <TabsContent value="active" className="flex-1 border-0 m-0 p-0">
                <CardContent className="p-0 flex-1">
                  <ScrollArea className="h-[calc(100vh-15rem)]">
                    <div className="divide-y">
                      {isLoading ? (
                        <div className="p-4 text-sm text-muted-foreground">
                          Loading tickets...
                        </div>
                      ) : filteredTickets.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No active tickets found
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
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{ticket.title}</p>
                                  {ticket.unreadCount > 0 && (
                                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                                  )}
                                </div>
                                <div className="mt-1.5 flex flex-col gap-1">
                                  {ticket.business && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Building2 className="h-3 w-3" />
                                      {ticket.business.username}
                                    </p>
                                  )}
                                  {ticket.hasBusinessResponse && ticket.unreadCount > 0 && (
                                    <Badge variant="secondary" className="w-fit bg-blue-50 text-blue-700">
                                      {ticket.unreadCount} new {ticket.unreadCount === 1 ? 'message' : 'messages'}
                                    </Badge>
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
                    </div>
                  </ScrollArea>
                </CardContent>
              </TabsContent>

              <TabsContent value="resolved" className="flex-1 border-0 m-0 p-0">
                <CardContent className="p-0 flex-1">
                  <ScrollArea className="h-[calc(100vh-15rem)]">
                    <div className="divide-y">
                      {isLoading ? (
                        <div className="p-4 text-sm text-muted-foreground">
                          Loading tickets...
                        </div>
                      ) : filteredTickets.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No resolved tickets found
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
                                  {ticket.business && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Building2 className="h-3 w-3" />
                                      {ticket.business.username}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Resolved {format(new Date(ticket.updatedAt), 'MMM d, yyyy')}
                                  </p>
                                  {ticket.status === "resolved" && ticket.hasFeedback === false && (
                                    <Badge variant="outline" className="w-fit text-orange-600 border-orange-600">
                                      Feedback needed
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <Badge variant="secondary">
                                Resolved
                              </Badge>
                            </div>
                          </button>
                        ))
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
              {selectedTicketId && selectedTicket ? (
                <div className="h-full flex flex-col">
                  {/* Ticket Details Header */}
                  <div className="border-b p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-xl font-semibold">{selectedTicket.title}</h2>
                        <div className="mt-1 space-y-1">
                          {selectedTicket.business && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              {selectedTicket.business.username}
                            </p>
                          )}
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            Created {format(new Date(selectedTicket.createdAt), 'MMM d, yyyy')}
                          </p>
                          {selectedTicket.status === 'resolved' && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              Resolved {format(new Date(selectedTicket.updatedAt), 'MMM d, yyyy')}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge variant={
                        selectedTicket.status === 'open' ? 'default' :
                        selectedTicket.status === 'in_progress' ? 'default' :
                        'secondary'
                      }>
                        {selectedTicket.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>

                  {/* Chat and Feedback Section */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <TicketChat
                      ticketId={selectedTicketId}
                      readonly={selectedTicket.status === "resolved"}
                    />
                    {selectedTicket.status === "resolved" && (
                      <div className="p-4 border-t">
                        <TicketFeedback
                          ticketId={selectedTicketId}
                          isResolved={true}
                        />
                      </div>
                    )}
                  </div>
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

      {/* New Ticket Dialog */}
      <Dialog open={isNewTicketDialogOpen} onOpenChange={setIsNewTicketDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Create New Support Ticket</DialogTitle>
            <DialogDescription>
              Fill out the form below to create a new support ticket. We'll connect you with the right business to help solve your issue.
            </DialogDescription>
          </DialogHeader>
          <TicketForm onSuccess={() => setIsNewTicketDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}