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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useUser();

  // Sort tickets with resolved ones at the bottom
  const sortTickets = (tickets: TicketListProps['tickets']) => {
    return [...tickets].sort((a, b) => {
      // First, separate resolved and unresolved tickets
      if (a.status === 'resolved' && b.status !== 'resolved') return 1;
      if (a.status !== 'resolved' && b.status === 'resolved') return -1;

      // If both are resolved or both are unresolved, sort by date
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  };

  const filterTickets = (view: 'active' | 'my-tickets' | 'history') => {
    const filtered = tickets.filter(ticket => {
      const isResolved = ticket.status === "resolved";

      if (isEmployee) {
        switch (view) {
          case 'active':
            return !isResolved && !ticket.claimedById;
          case 'my-tickets':
            return !isResolved && ticket.claimedById === user?.id;
          case 'history':
            return isResolved && (ticket.claimedById === user?.id || ticket.claimedById === null);
          default:
            return false;
        }
      } else {
        return view === 'history' ? isResolved : !isResolved;
      }
    });

    // Apply sorting to the filtered tickets
    return sortTickets(filtered);
  };

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

  const handleMessageClick = (ticketId: number) => {
    setLocation(`/messages?ticketId=${ticketId}`);
  };

  return (
    <div>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-end h-12 px-4">
          <Select
            value={viewType}
            onValueChange={(value: 'active' | 'my-tickets' | 'history') => setViewType(value)}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Select view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Tickets</SelectItem>
              {isEmployee && <SelectItem value="my-tickets">My Tickets</SelectItem>}
              <SelectItem value="history">Ticket History</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-4 py-2 space-y-2">
        {filterTickets(viewType).map((ticket) => (
          <Card
            key={ticket.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
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
                    <div className="flex items-center gap-4">
                      <span>{ticket.customer.username}</span>
                      <span>·</span>
                      <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                    </div>
                    {viewType !== 'history' && ticket.claimedAt && (
                      <div>Claimed: {new Date(ticket.claimedAt).toLocaleDateString()}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleMessageClick(ticket.id);
              }}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              View Messages
            </Button>
          </Card>
        ))}
        {filterTickets(viewType).length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No {viewType === 'active' ? 'active' : viewType === 'my-tickets' ? 'claimed' : 'resolved'} tickets
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
                      Created on {new Date(selectedTicket.createdAt).toLocaleDateString()}
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
                      <div className="flex gap-2">
                        <Select
                          value={selectedTicket?.status}
                          onValueChange={async (status) => {
                            try {
                              const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
                                method: 'PATCH',
                                headers: {
                                  'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ status }),
                                credentials: 'include'
                              });
                              if (!res.ok) throw new Error(await res.text());
                              queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
                              toast({
                                title: "Success",
                                description: "Ticket status updated successfully",
                              });
                            } catch (error) {
                              toast({
                                variant: "destructive",
                                title: "Error",
                                description: (error as Error).message,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="w-[140px]">
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