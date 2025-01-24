import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketList from "@/components/ticket-list";
import TicketFilters from "@/components/ticket-filters";
import InvitationHandler from "@/components/invitation-handler";
import BusinessSwitcher from "@/components/business-switcher";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Building2 } from "lucide-react";
import { Link } from "wouter";
import type { Ticket } from "@db/schema";

interface BusinessConnection {
  business: {
    id: number;
    businessName: string;
  };
  connection: {
    isActive: boolean;
  };
}

export default function EmployeeDashboard() {
  const { user, logout } = useUser();
  const [currentBusinessId, setCurrentBusinessId] = useState<string>();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  // Query to check business connections
  const { data: businessConnections = [], isLoading: isLoadingBusinesses } = useQuery<BusinessConnection[]>({
    queryKey: ['/api/employees/active-businesses'],
  });

  // Get tickets for the selected business or all connected businesses
  const { data: tickets = [], isLoading: isLoadingTickets } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets', currentBusinessId],
    queryFn: async () => {
      const url = currentBusinessId 
        ? `/api/tickets?businessProfileId=${currentBusinessId}`
        : '/api/tickets';
      const res = await fetch(url, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: businessConnections.length > 0,
  });

  // Get current business name
  const currentBusiness = businessConnections.find(
    conn => conn.business.id.toString() === currentBusinessId
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-8 flex h-16 items-center">
          <div className="mr-4">
            <h1 className="text-xl font-semibold">Employee Dashboard</h1>
          </div>

          {/* Business Switcher - Always visible */}
          <BusinessSwitcher
            onBusinessChange={setCurrentBusinessId}
            currentBusinessId={currentBusinessId}
          />

          <div className="flex-1 flex items-center justify-end gap-4">
            <Link href="/messages">
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Messages
              </Button>
            </Link>
            <div className="flex items-center gap-4 border-l pl-4">
              <span className="text-sm text-muted-foreground">
                Welcome, {user?.username}
              </span>
              <Button variant="ghost" size="sm" onClick={() => logout()}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Display selected business context */}
      {currentBusiness && (
        <div className="border-b bg-muted/50">
          <div className="container mx-auto px-8 py-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-lg font-medium">
                Working with: {currentBusiness.business.business_name}
              </span>
            </div>
          </div>
        </div>
      )}

      <main className="container mx-auto px-8 py-8 space-y-8">
        <InvitationHandler />

        {isLoadingBusinesses || isLoadingTickets ? (
          <Card>
            <CardContent className="py-8">
              <div className="flex justify-center">
                Loading...
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                {currentBusinessId 
                  ? `Tickets for ${currentBusiness?.business.businessName}`
                  : "All Active Tickets"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <TicketFilters 
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                categoryFilter={categoryFilter}
                onCategoryChange={setCategoryFilter}
                priorityFilter={priorityFilter}
                onPriorityChange={setPriorityFilter}
                onSortChange={setSortBy}
              />
              <TicketList
                tickets={tickets}
                isEmployee={true}
                userId={user?.id}
              />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}