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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, UserCheck } from "lucide-react";
import { useLocation } from "wouter";
import type { Ticket } from "@db/schema";
import { useState } from "react";
import TicketDetails from "./ticket-details";
import { useUser } from "@/hooks/use-user";

interface TicketListProps {
  tickets: Ticket[];
  isBusiness?: boolean;
}

export default function TicketList({ tickets, isBusiness = false }: TicketListProps) {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user } = useUser();

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

  const assignTicket = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await fetch(`/api/tickets/${ticketId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      toast({
        title: "Success",
        description: "Ticket assigned successfully",
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

  const isAssignedToCurrentUser = (ticket: Ticket) => {
    return ticket.assignedToId === user?.id;
  };

  const canModifyTicket = (ticket: Ticket) => {
    return !ticket.assignedToId || isAssignedToCurrentUser(ticket);
  };

  return (
    <>
      <div className="space-y-4">
        {tickets.map((ticket) => (
          <Card
            key={ticket.id}
            className={`cursor-pointer hover:shadow-md transition-shadow ${
              !canModifyTicket(ticket) ? 'opacity-50' : ''
            }`}
            onClick={() => setSelectedTicket(ticket)}
          >
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    {ticket.title}
                    {ticket.assignedToId && (
                      <UserCheck className={`h-5 w-5 ${
                        isAssignedToCurrentUser(ticket) ? 'text-green-500' : 'text-gray-400'
                      }`} />
                    )}
                  </CardTitle>
                  <CardDescription>
                    Created on {new Date(ticket.createdAt).toLocaleDateString()}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge className={getStatusColor(ticket.status)}>
                    {ticket.status.replace("_", " ")}
                  </Badge>
                  <Badge className={getPriorityColor(ticket.priority)}>
                    {ticket.priority.toUpperCase()}
                  </Badge>
                  {isBusiness && (
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
              <div className="flex justify-between items-center">
                <Badge variant="outline">{getCategoryLabel(ticket.category)}</Badge>
                {(isBusiness || user?.role === "employee") && !ticket.assignedToId && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      assignTicket.mutate(ticket.id);
                    }}
                    disabled={assignTicket.isPending}
                  >
                    Claim Ticket
                  </Button>
                )}
              </div>
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
                    <DialogTitle className="flex items-center gap-2">
                      {selectedTicket.title}
                      {selectedTicket.assignedToId && (
                        <UserCheck className={`h-5 w-5 ${
                          isAssignedToCurrentUser(selectedTicket) ? 'text-green-500' : 'text-gray-400'
                        }`} />
                      )}
                    </DialogTitle>
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

                  {(isBusiness || user?.role === "employee") && canModifyTicket(selectedTicket) && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Actions</h3>
                      <div className="flex gap-2">
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
                            updateTicket.isPending
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
                            updateTicket.isPending
                          }
                        >
                          Mark Resolved
                        </Button>
                      </div>
                      {!selectedTicket.assignedToId && (
                        <Button
                          onClick={() => assignTicket.mutate(selectedTicket.id)}
                          disabled={assignTicket.isPending}
                          className="w-full"
                        >
                          Claim Ticket
                        </Button>
                      )}
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
                  )}

                  <Separator />
                  {canModifyTicket(selectedTicket) ? (
                    <TicketDetails ticketId={selectedTicket.id} />
                  ) : (
                    <p className="text-center text-muted-foreground py-4">
                      This ticket is assigned to another employee
                    </p>
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