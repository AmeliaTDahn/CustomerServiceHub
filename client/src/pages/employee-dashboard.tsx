import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

  // Filter tickets based on user input
  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch = searchTerm === "" || 
      ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || ticket.category === categoryFilter;
    const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesPriority;
  }).sort((a, b) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "priority":
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority as keyof typeof priorityOrder] - 
               priorityOrder[b.priority as keyof typeof priorityOrder];
      default:
        return 0;
    }
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold">Employee Dashboard</h1>
              {businessConnections.length > 0 && (
                <BusinessSwitcher
                  onBusinessChange={setCurrentBusinessId}
                  currentBusinessId={currentBusinessId}
                />
              )}
            </div>
            <div className="flex items-center gap-4">
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
        </div>
      </header>

      {/* Display business context if available */}
      {businessConnections.length > 0 && (
        <div className="container py-4 border-b">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            <span className="text-lg font-medium">
              {currentBusiness 
                ? `Working for: ${currentBusiness.business.businessName}`
                : `Connected to ${businessConnections.length} business${businessConnections.length > 1 ? 'es' : ''}`
              }
            </span>
          </div>
        </div>
      )}

      <main className="container py-8 space-y-8">
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
                onSearchChange={setSearchTerm}
                onStatusChange={setStatusFilter}
                onCategoryChange={setCategoryFilter}
                onPriorityChange={setPriorityFilter}
                onSortChange={setSortBy}
              />
              <TicketList tickets={filteredTickets} isEmployee />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}