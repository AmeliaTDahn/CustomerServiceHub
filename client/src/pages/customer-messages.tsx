import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import TicketChat from "@/components/ticket-chat";
import TicketForm from "@/components/ticket-form";
import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

interface TicketWithInfo {
  id: number;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved';
  customer_id: string;
  business_id: string;
  created_at: string;
  updated_at: string;
  business?: {
    id: number;
    username: string;
  };
  claimed_by_id: string | null;
  hasBusinessResponse: boolean;
  unreadCount: number;
  hasFeedback?: boolean;
}

export default function CustomerMessages() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ticketId = new URLSearchParams(window.location.search).get('ticketId');
  const { user } = useUser();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    ticketId ? parseInt(ticketId) : null
  );
  const [activeTab, setActiveTab] = useState<string>("active");
  const [isNewTicketDialogOpen, setIsNewTicketDialogOpen] = useState(false);

  // Fetch customer's tickets using Supabase
  const { data: tickets = [], isLoading } = useQuery<TicketWithInfo[]>({
    queryKey: ['/api/tickets/customer'],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data: tickets, error } = await supabase
        .from('tickets')
        .select(`
          *,
          business:business_profile_id (
            id,
            business_name,
            user_id
          )
        `)
        .eq('customer_id', user.id.toString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get unread counts and business responses
      const ticketsWithInfo = await Promise.all((tickets || []).map(async (ticket) => {
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { head: true, count: 'exact' })
          .eq('ticket_id', ticket.id)
          .eq('sender_id', ticket.business_id)
          .eq('status', 'unread');

        const { count: hasBusinessResponse } = await supabase
          .from('messages')
          .select('*', { head: true, count: 'exact' })
          .eq('ticket_id', ticket.id)
          .eq('sender_id', ticket.business_id);

        return {
          ...ticket,
          unreadCount: unreadCount || 0,
          hasBusinessResponse: hasBusinessResponse ? hasBusinessResponse > 0 : false
        };
      }));

      return ticketsWithInfo;
    },
    refetchInterval: 5000 // Poll every 5 seconds
  });

  // Get the selected ticket
  const selectedTicket = tickets.find(t => t.id === selectedTicketId);

  // Filter tickets based on search
  const filteredTickets = tickets.filter(ticket =>
    ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ticket.business?.business_name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user?.id) return;

    const ticketsSubscription = supabase
      .channel('tickets')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `customer_id=eq.${user.id}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['/api/tickets/customer'] });
        }
      )
      .subscribe();

    return () => {
      ticketsSubscription.unsubscribe();
    };
  }, [user?.id, queryClient]);

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
          New Support Chat
        </Button>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-7rem)]">
          {/* Chat List Sidebar */}
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
                    placeholder="Search conversations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
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
                          Loading conversations...
                        </div>
                      ) : filteredTickets.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No active conversations found
                        </div>
                      ) : (
                        filteredTickets.map((ticket) => (
                          <button
                            key={ticket.id}
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                              selectedTicketId === ticket.id ? "bg-primary/5" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium truncate">{ticket.title}</p>
                                  {!ticket.claimed_by_id && (
                                    <Badge variant="outline" className="animate-pulse">
                                      Waiting
                                    </Badge>
                                  )}
                                  {ticket.unreadCount > 0 && (
                                    <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                                      {ticket.unreadCount} new
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-1.5 flex flex-col gap-1">
                                  {ticket.business && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Building2 className="h-3 w-3" />
                                      {ticket.business.business_name}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {format(new Date(ticket.updated_at), 'MMM d, yyyy')}
                                    {!ticket.claimed_by_id && (
                                      <span className="text-yellow-600">• Awaiting Response</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <Badge variant={
                                ticket.status === 'open' ? 'default' :
                                ticket.status === 'in_progress' ? 'secondary' :
                                'outline'
                              }>
                                {ticket.status.replace('_', ' ')}
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
                            onClick={() => setSelectedTicketId(ticket.id)}
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
                                      {ticket.business.business_name}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Resolved {format(new Date(ticket.updated_at), 'MMM d, yyyy')}
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
          <Card className="col-span-8 flex flex-col">
            <CardContent className="p-0 flex-1 flex flex-col h-full">
              {selectedTicketId && selectedTicket ? (
                <TicketChat
                  ticketId={selectedTicketId}
                  readonly={selectedTicket.status === "resolved"}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a conversation or start a new one
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
            <DialogTitle>Start New Support Conversation</DialogTitle>
            <DialogDescription>
              Tell us about your issue and we'll connect you with the right team to help solve it.
            </DialogDescription>
          </DialogHeader>
          <TicketForm onSuccess={() => setIsNewTicketDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}