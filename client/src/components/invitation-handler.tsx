import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface Invitation {
  id: number;
  businessProfileId: number;
  status: string;
  createdAt: string;
  businessProfile: {
    businessName: string;
  };
}

export default function InvitationHandler() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch pending invitations
  const { data: invitations = [] } = useQuery<Invitation[]>({
    queryKey: ['/api/employees/invitations'],
    queryFn: async () => {
      const res = await fetch('/api/employees/invitations', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  // Handle invitation response
  const handleInvitation = useMutation({
    mutationFn: async ({ invitationId, accept }: { invitationId: number; accept: boolean }) => {
      const res = await fetch(`/api/invitations/${invitationId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to respond to invitation");
      }
      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees/invitations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/businesses'] });

      toast({
        title: "Success",
        description: `Invitation ${variables.accept ? 'accepted' : 'declined'} successfully`,
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
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex items-center justify-between p-4 rounded-lg border"
            >
              <div>
                <p className="font-medium">{invitation.businessProfile.businessName}</p>
                <p className="text-sm text-muted-foreground">
                  Invited {new Date(invitation.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  onClick={() =>
                    handleInvitation.mutate({
                      invitationId: invitation.id,
                      accept: true
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
                      invitationId: invitation.id,
                      accept: false
                    })
                  }
                  disabled={handleInvitation.isPending}
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}