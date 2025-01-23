import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Lock, Unlock } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Ticket } from "@db/schema";
import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import TicketNotes from "./ticket-notes";
import TicketFeedback from "./ticket-feedback";
import { cn } from "@/lib/utils";

interface TicketListProps {
  tickets: (Ticket & {
    customer: { id: number; username: string };
    business: { id: number; username: string };
    hasBusinessResponse?: boolean;
    hasFeedback?: boolean;
    unreadCount: number;
    claimedById?: number | null;
    claimedAt?: string | null;
  })[];
  isBusiness?: boolean;
  isEmployee?: boolean;
  readonly?: boolean;
}

export default function TicketList({ tickets, isBusiness = false, isEmployee = false, readonly = false }: TicketListProps) {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [viewType, setViewType] = useState<'active' | 'my-tickets' | 'history'>('active');
  const [showHistory, setShowHistory] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useUser();

  const filterAndSortTickets = (view: 'active' | 'my-tickets' | 'history', showHistoryView: boolean) => {
    // First, filter the tickets
    const filteredTickets = tickets.filter(ticket => {
      const historyFilter = showHistoryView ? ticket.status === "resolved" : ticket.status !== "resolved";

      if (isEmployee && !showHistory) {
        switch (view) {
          case 'active':
            return historyFilter && !ticket.claimedById;
          case 'my-tickets':
            return historyFilter && ticket.claimedById === user?.id;
          case 'history':
            return historyFilter;
        }
      }

      return historyFilter;
    });

    // Then, sort the tickets
    return filteredTickets.sort((a, b) => {
      // First, separate resolved and unresolved tickets
      if (a.status === "resolved" && b.status !== "resolved") return 1;
      if (a.status !== "resolved" && b.status === "resolved") return -1;

      // Within each group (resolved/unresolved), sort by creation date (newest first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  };

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

  // Add mutation for updating ticket status
  const updateTicketStatus = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: number; status: "open" | "in_progress" | "resolved" }) => {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      toast({
        title: "Success",
        description: "Ticket status updated successfully",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    },
  });

  const claimTicket = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await fetch(`/api/tickets/${ticketId}/claim`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      toast({
        title: "Success",
        description: "Ticket claimed successfully",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    },
  });

  const unclaimTicket = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await fetch(`/api/tickets/${ticketId}/unclaim`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      toast({
        title: "Success",
        description: "Ticket unclaimed successfully",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    },
  });

  const handleMessageClick = (customerId: number) => {
    setLocation(`/messages?customerId=${customerId}`);
  };

  return (
    <div>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-between h-12 px-4">
          {/* Toggle switch for all account types */}
          <div className="flex items-center gap-2">
            <Switch
              checked={showHistory}
              onCheckedChange={setShowHistory}
              id="history-mode"
            />
            <label htmlFor="history-mode" className="text-sm font-medium">
              {showHistory ? "History" : "Active Chats"}
            </label>
          </div>

          {/* Employee-specific view selector */}
          {isEmployee && !showHistory && (
            <Select
              value={viewType}
              onValueChange={(value: 'active' | 'my-tickets' | 'history') => setViewType(value)}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Select view" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active Tickets</SelectItem>
                <SelectItem value="my-tickets">My Tickets</SelectItem>
                <SelectItem value="history">All Tickets</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="px-4 py-2 space-y-2">
        {filterAndSortTickets(viewType, showHistory).map((ticket) => (
          <Card
            key={ticket.id}
            className={cn(
              "cursor-pointer hover:shadow-md transition-shadow",
              ticket.status === "resolved" && "opacity-75"
            )}
            onClick={() => setSelectedTicket(ticket)}
          >
            <div className="p-3">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium truncate">{ticket.title}</h3>
                    {ticket.unreadCount > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {ticket.unreadCount} new
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span>Created: {new Date(ticket.createdAt).toLocaleDateString()}</span>
                      <Badge className={`${getStatusColor(ticket.status)} text-xs`}>
                        {ticket.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {filterAndSortTickets(viewType, showHistory).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No {showHistory ? 'resolved' : 'active'} tickets
          </div>
        )}
      </div>

      <Dialog open={selectedTicket !== null} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl">
          {selectedTicket && (
            <div className="flex flex-col">
              <DialogHeader>
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <DialogTitle>{selectedTicket.title}</DialogTitle>
                    <DialogDescription>
                      <div className="space-y-1">
                        <div>Created on {new Date(selectedTicket.createdAt).toLocaleDateString()}</div>
                        <Badge className={`${getStatusColor(selectedTicket.status)} text-xs`}>
                          {selectedTicket.status.replace("_", " ")}
                        </Badge>
                      </div>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="mt-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Description</h3>
                    <div className="prose prose-sm max-w-none bg-muted p-3 rounded-lg">
                      <p>{selectedTicket.description}</p>
                    </div>
                  </div>

                  {isEmployee && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Actions</h3>
                      <div className="flex flex-wrap gap-2">
                        {/* Status selector for employees */}
                        <Select
                          value={selectedTicket.status}
                          onValueChange={(value) =>
                            updateTicketStatus.mutate({
                              ticketId: selectedTicket.id,
                              status: value
                            })
                          }
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>

                        {selectedTicket.claimedById === null ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => claimTicket.mutate(selectedTicket.id)}
                            disabled={claimTicket.isPending}
                          >
                            <Lock className="mr-2 h-4 w-4" />
                            Claim Ticket
                          </Button>
                        ) : selectedTicket.claimedById === user?.id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => unclaimTicket.mutate(selectedTicket.id)}
                            disabled={unclaimTicket.isPending}
                          >
                            <Unlock className="mr-2 h-4 w-4" />
                            Unclaim Ticket
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMessageClick(selectedTicket.customer.id)}
                        >
                          <MessageCircle className="mr-2 h-4 w-4" />
                          View Messages
                        </Button>
                      </div>
                    </div>
                  )}

                  {(isBusiness || isEmployee) && (
                    <div className="mt-6">
                      <ScrollArea className="h-[200px] rounded-md border p-4">
                        <TicketNotes ticketId={selectedTicket.id} />
                      </ScrollArea>
                    </div>
                  )}

                  {!isBusiness && !isEmployee && selectedTicket.status === "resolved" && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Feedback</h3>
                      <div className="bg-muted rounded-lg p-4">
                        <TicketFeedback
                          ticketId={selectedTicket.id}
                          isResolved={true}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}