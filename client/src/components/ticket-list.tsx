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
import { useToast } from "@/hooks/use-toast";
import type { Ticket } from "@db/schema";

interface TicketListProps {
  tickets: Ticket[];
  isBusiness?: boolean;
}

export default function TicketList({ tickets, isBusiness = false }: TicketListProps) {
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
    return category.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <div className="space-y-4">
      {tickets.map((ticket) => (
        <Card key={ticket.id}>
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
            <div className="space-y-4">
              <div>
                <Badge variant="outline">{getCategoryLabel(ticket.category)}</Badge>
              </div>
              <p className="text-sm text-gray-600">{ticket.description}</p>
              {isBusiness && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateTicket.mutate({ id: ticket.id, status: "in_progress" })
                    }
                    disabled={ticket.status === "in_progress"}
                  >
                    Mark In Progress
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      updateTicket.mutate({ id: ticket.id, status: "resolved" })
                    }
                    disabled={ticket.status === "resolved"}
                  >
                    Mark Resolved
                  </Button>
                </div>
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
  );
}