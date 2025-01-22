import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useLocation } from "wouter";
import type { Ticket } from "@db/schema";
import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import TicketNotes from "./ticket-notes";
import TicketFeedback from "./ticket-feedback";

interface TicketListProps {
  tickets: Ticket[];
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
    if (readonly) return false;
    if (isBusiness) return true;
    if (isEmployee) {
      return ticket.claimedById === user?.id;
    }
    return false;
  };

  return (
    <>
      <div className="space-y-4">
        {tickets.map((ticket) => (
          <Card
            key={ticket.id}
            className={`${readonly ? '' : 'cursor-pointer hover:shadow-md'} transition-shadow`}
            onClick={() => !readonly && setSelectedTicket(ticket)}
          >
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CardTitle>{ticket.title}</CardTitle>
                    {ticket.claimedById && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Lock className="h-4 w-4" />
                        <span className="text-xs">
                          {ticket.claimedById === user?.id ? "Claimed by you" : "Claimed"}
                        </span>
                      </div>
                    )}
                  </div>
                  <CardDescription>
                    Created on {new Date(ticket.createdAt).toLocaleDateString()}
                  </CardDescription>
                </div>
                <div className="flex gap-2 items-center">
                  <Badge className={getStatusColor(ticket.status)}>
                    {ticket.status.replace("_", " ")}
                  </Badge>
                  <Badge className={getPriorityColor(ticket.priority)}>
                    {ticket.priority.toUpperCase()}
                  </Badge>
                  {!readonly && (isBusiness || isEmployee) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMessageClick(ticket.customerId);
                      }}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">{getCategoryLabel(ticket.category)}</Badge>
            </CardContent>
          </Card>
        ))}
        {tickets.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No tickets found
            </CardContent>
          </Card>
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
                  <div className="flex gap-2">
                    <Badge className={getStatusColor(selectedTicket.status)}>
                      {selectedTicket.status.replace("_", " ")}
                    </Badge>
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

                  {!readonly && (isBusiness || isEmployee) && (
                    <>
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
                          {canUpdateTicket(selectedTicket) && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  updateTicket.mutate({
                                    id: selectedTicket.id,
                                    status: "in_progress",
                                  })
                                }
                                disabled={
                                  selectedTicket.status === "in_progress" ||
                                  updateTicket.isPending ||
                                  (isEmployee && !canUpdateTicket(selectedTicket))
                                }
                              >
                                Mark In Progress
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  updateTicket.mutate({
                                    id: selectedTicket.id,
                                    status: "resolved",
                                  })
                                }
                                disabled={
                                  selectedTicket.status === "resolved" ||
                                  updateTicket.isPending ||
                                  (isEmployee && !canUpdateTicket(selectedTicket))
                                }
                              >
                                Mark Resolved
                              </Button>
                            </>
                          )}
                        </div>
                        <Button
                          onClick={() => {
                            handleMessageClick(selectedTicket.customerId);
                          }}
                          className="w-full mt-2"
                        >
                          <MessageCircle className="mr-2 h-4 w-4" />
                          Message Customer
                        </Button>
                      </div>

                      <div className="mt-6">
                        <ScrollArea className="h-[200px] rounded-md border p-4">
                          <TicketNotes ticketId={selectedTicket.id} />
                        </ScrollArea>
                      </div>
                    </>
                  )}
                  {!isBusiness && !isEmployee && (
                    <div className="space-y-4">
                      <ScrollArea className="h-[200px] rounded-md border p-4">
                        <TicketFeedback
                          ticketId={selectedTicket.id}
                          isResolved={selectedTicket.status === "resolved"}
                        />
                      </ScrollArea>
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