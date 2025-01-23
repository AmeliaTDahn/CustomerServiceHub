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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  })[];
  isBusiness?: boolean;
  isEmployee?: boolean;
  readonly?: boolean;
}

export default function TicketList({ tickets, isBusiness = false, isEmployee = false, readonly = false }: TicketListProps) {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useUser();

  // Function to filter tickets for active and history tabs
  const filterTickets = (isHistory: boolean) => {
    return tickets.filter(ticket => {
      if (isHistory) {
        // History tab shows all resolved tickets
        return ticket.status === "resolved";
      } else {
        // Active tab shows unresolved tickets
        return ticket.status !== "resolved";
      }
    });
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

  const updateTicket = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
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

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800";
      case "high":
        return "bg-orange-100 text-orange-800";
      case "medium":
        return "bg-blue-100 text-blue-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getCategoryLabel = (category: string) => {
    return category
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const handleMessageClick = (customerId: number) => {
    setLocation(`/messages?customerId=${customerId}`);
  };

  const canUpdateTicket = (ticket: Ticket) => {
    // For non-business users, readonly tickets are not editable
    if (!isBusiness && readonly) return false;

    // Business users can update any ticket
    if (isBusiness) return true;

    // Employee can only update if they claimed the ticket and it's not resolved
    if (isEmployee) {
      return ticket.claimedById === user?.id && ticket.status !== "resolved";
    }

    // Customers can't update ticket status
    return false;
  };

  const handleStatusChange = (ticketId: number, newStatus: string) => {
    updateTicket.mutate({ id: ticketId, status: newStatus });
  };

  return (
    <>
      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="active">Active Tickets</TabsTrigger>
          <TabsTrigger value="history">Ticket History</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <div className="space-y-4">
            {filterTickets(false).map((ticket) => (
              <Card
                key={ticket.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  if (!isBusiness && !isEmployee && ticket.hasBusinessResponse) {
                    setSelectedTicket(ticket);
                  }
                  if (isBusiness || isEmployee) {
                    setSelectedTicket(ticket);
                  }
                }}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle>{ticket.title}</CardTitle>
                        {ticket.unreadCount > 0 && (
                          <Badge variant="secondary">
                            {ticket.unreadCount} new {ticket.unreadCount === 1 ? 'message' : 'messages'}
                          </Badge>
                        )}
                      </div>
                      <CardDescription>
                        <div className="space-y-1">
                          {!isBusiness && !isEmployee && (
                            <div>Submitted to: {ticket.business.username}</div>
                          )}
                          {(isBusiness || isEmployee) && (
                            <div>From: {ticket.customer.username}</div>
                          )}
                          <div>Created on {new Date(ticket.createdAt).toLocaleDateString()}</div>
                        </div>
                      </CardDescription>
                    </div>
                    <div className="flex gap-2 items-center">
                      <Badge className={getStatusColor(ticket.status)}>
                        {ticket.status.replace("_", " ")}
                      </Badge>
                      <Badge className={getPriorityColor(ticket.priority)}>
                        {ticket.priority.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">{getCategoryLabel(ticket.category)}</Badge>
                  {!isBusiness && !isEmployee && !ticket.hasBusinessResponse && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      Waiting for support team to respond
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
            {filterTickets(false).length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No active tickets
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
        <TabsContent value="history">
          <div className="space-y-4">
            {filterTickets(true).map((ticket) => (
              <Card
                key={ticket.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedTicket(ticket)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle>{ticket.title}</CardTitle>
                      <CardDescription>
                        <div className="space-y-1">
                          {!isBusiness && !isEmployee && (
                            <div>Submitted to: {ticket.business.username}</div>
                          )}
                          {(isBusiness || isEmployee) && (
                            <div>From: {ticket.customer.username}</div>
                          )}
                          <div>Created on {new Date(ticket.createdAt).toLocaleDateString()}</div>
                          <div>Resolved on {new Date(ticket.updatedAt).toLocaleDateString()}</div>
                        </div>
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Badge className={getStatusColor(ticket.status)}>
                        {ticket.status.replace("_", " ")}
                      </Badge>
                      {ticket.hasFeedback && (
                        <Badge variant="outline">Feedback Provided</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline">{getCategoryLabel(ticket.category)}</Badge>
                </CardContent>
              </Card>
            ))}
            {filterTickets(true).length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  No resolved tickets
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

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
                  <div className="flex gap-2">
                    {canUpdateTicket(selectedTicket) ? (
                      <Select
                        defaultValue={selectedTicket.status}
                        onValueChange={(value) => handleStatusChange(selectedTicket.id, value)}
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
                    ) : (
                      <Badge className={getStatusColor(selectedTicket.status)}>
                        {selectedTicket.status.replace("_", " ")}
                      </Badge>
                    )}
                    <Badge className={getPriorityColor(selectedTicket.priority)}>
                      {selectedTicket.priority.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">
                      {getCategoryLabel(selectedTicket.category)}
                    </Badge>
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

                  {(isBusiness || isEmployee) && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Actions</h3>
                      <div className="flex gap-2">
                        {isEmployee && (
                          selectedTicket.claimedById === null ? (
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
                          )
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setLocation(`/messages?ticketId=${selectedTicket.id}`)}
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

                  {!isBusiness && !isEmployee && selectedTicket.hasBusinessResponse && (
                    <div className="mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                        onClick={() => setLocation(`/messages?ticketId=${selectedTicket.id}`)}
                      >
                        <MessageCircle className="h-4 w-4" />
                        View Messages
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}