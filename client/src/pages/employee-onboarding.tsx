import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

interface Business {
  id: number;
  username: string;
}

export default function EmployeeOnboarding() {
  const [searchTerm, setSearchTerm] = useState("");
  const { user } = useUser();
  const { toast } = useToast();

  // Fetch all businesses
  const { data: businesses = [] } = useQuery<Business[]>({
    queryKey: ['/api/businesses'],
  });

  // Request to join mutation
  const requestJoin = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await fetch(`/api/businesses/${businessId}/employees/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: user?.id }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to send request");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Request sent successfully. Please wait for the business to approve.",
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

  const filteredBusinesses = businesses.filter(business =>
    business.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Join a Business</h1>
          <p className="mt-2 text-sm text-gray-600">
            Search for a business and send a request to join their support team
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Available Businesses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                placeholder="Search businesses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              <div className="space-y-2">
                {filteredBusinesses.map((business) => (
                  <div
                    key={business.id}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <span className="font-medium">{business.username}</span>
                    <Button
                      onClick={() => requestJoin.mutate(business.id)}
                      disabled={requestJoin.isPending}
                    >
                      {requestJoin.isPending ? "Sending..." : "Request to Join"}
                    </Button>
                  </div>
                ))}
                {filteredBusinesses.length === 0 && (
                  <p className="text-center text-muted-foreground">
                    No businesses found
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
