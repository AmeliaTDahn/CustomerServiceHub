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
import type { Ticket } from "@db/schema";
import { useState } from "react";
import TicketChat from "./ticket-chat";
import TicketNotes from "./ticket-notes";

interface TicketListProps {
  tickets: Ticket[];
  isBusiness?: boolean;
}

export default function TicketList({ tickets, isBusiness = false }: TicketListProps) {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  return (
    <>
      <div className="space-y-4">
        {tickets.map((ticket) => (
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
        <DialogContent className="max-w-4xl h-[80vh]">
          {selectedTicket && (
            <div className="h-full flex flex-col">
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

              <div className="flex-1 overflow-hidden">
                <div className="h-full grid grid-cols-2 gap-6">
                  {/* Left column: Ticket details */}
                  <div className="space-y-4">
                    <ScrollArea className="h-full pr-4">
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-sm font-medium mb-2">Description</h3>
                          <div className="prose prose-sm max-w-none">
                            <p>{selectedTicket.description}</p>
                          </div>
                        </div>
                        {isBusiness && (
                          <div className="pt-4">
                            <h3 className="text-sm font-medium mb-2">Actions</h3>
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
                                disabled={selectedTicket.status === "in_progress"}
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
                                disabled={selectedTicket.status === "resolved"}
                              >
                                Mark Resolved
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Right column: Notes and Chat */}
                  <div className="border-l pl-6 space-y-6 h-full flex flex-col">
                    {isBusiness && (
                      <>
                        <div className="flex-1">
                          <TicketNotes ticketId={selectedTicket.id} />
                        </div>
                        <Separator />
                      </>
                    )}
                    <div className={isBusiness ? "flex-1" : "h-full"}>
                      <h3 className="font-semibold mb-4">Chat</h3>
                      <TicketChat ticketId={selectedTicket.id} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}