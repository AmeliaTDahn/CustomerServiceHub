import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Invitation {
  invitation: {
    id: number;
    status: string;
    createdAt: string;
  };
  business: {
    id: number;
    name: string;
  };
}

export default function InvitationHandler() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch pending invitations
  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: ['/api/employees/invitations'],
  });

  // Handle invitation response
  const handleInvitation = useMutation({
    mutationFn: async ({ id, status, businessId }: { id: number; status: 'accepted' | 'rejected'; businessId: number }) => {
      const res = await fetch(`/api/invitations/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          accept: status === 'accepted',
          businessId
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to respond to invitation");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      // If invitation was accepted, invalidate relevant queries
      if (variables.status === 'accepted') {
        // Invalidate both direct messages and employee lists
        queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
        queryClient.invalidateQueries({ queryKey: ['/api/businesses/employees'] });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/employees/invitations'] });

      toast({
        title: "Success",
        description: `Invitation ${variables.status} successfully`,
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

  if (invitations.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Invitations</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {invitations.map(({ invitation, business }) => (
            <div
              key={invitation.id}
              className="flex items-center justify-between p-4 rounded-lg border"
            >
              <div>
                <p className="font-medium">{business.name}</p>
                <p className="text-sm text-muted-foreground">
                  Invited {new Date(invitation.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  onClick={() =>
                    handleInvitation.mutate({
                      id: invitation.id,
                      status: "accepted",
                      businessId: business.id
                    })
                  }
                  disabled={handleInvitation.isPending}
                >
                  Accept
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    handleInvitation.mutate({
                      id: invitation.id,
                      status: "rejected",
                      businessId: business.id
                    })
                  }
                  disabled={handleInvitation.isPending}
                >
                  Reject
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}