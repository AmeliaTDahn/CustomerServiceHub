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

  return (
    <div className="space-y-4">
      {tickets.map((ticket) => (
        <Card key={ticket.id}>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>{ticket.title}</CardTitle>
                <CardDescription>
                  Created on {new Date(ticket.createdAt).toLocaleDateString()}
                </CardDescription>
              </div>
              <Badge className={getStatusColor(ticket.status)}>
                {ticket.status.replace("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">{ticket.description}</p>
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
