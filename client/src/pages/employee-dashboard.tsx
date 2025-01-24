import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import TicketList from "@/components/ticket-list";
import TicketFilters from "@/components/ticket-filters";
import InvitationHandler from "@/components/invitation-handler";
import BusinessSwitcher from "@/components/business-switcher";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Building2, AlertCircle } from "lucide-react";
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
  const { data: businessConnections = [] } = useQuery<BusinessConnection[]>({
    queryKey: ['/api/employees/active-businesses'],
  });

  // Get tickets for the selected business
  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets', currentBusinessId],
    queryFn: async () => {
      if (!currentBusinessId) return [];
      const res = await fetch(`/api/tickets?businessProfileId=${currentBusinessId}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!currentBusinessId,
  });

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

  // Check connection states
  const hasConnections = businessConnections.length > 0;
  const hasActiveConnections = businessConnections.some(conn => conn.connection.isActive);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold">Employee Dashboard</h1>
              {hasActiveConnections && (
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

      <main className="container py-8 space-y-8">
        <InvitationHandler />

        {!hasConnections ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Welcome to the Support Platform
              </CardTitle>
              <CardDescription>
                You're not currently connected to any business
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                To start handling customer support tickets, you need to:
              </p>
              <ol className="list-decimal list-inside space-y-2 mt-4 text-muted-foreground">
                <li>Wait for a business to invite you to their support team</li>
                <li>Accept the invitation when it arrives</li>
                <li>Once accepted, you'll see customer tickets here</li>
              </ol>
            </CardContent>
          </Card>
        ) : !hasActiveConnections ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Access Currently Paused
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Your access to the support platform is currently paused. Here are your business connections:
              </p>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {businessConnections.map((connection) => (
                  <Card key={connection.business.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Building2 className="h-4 w-4" />
                        {connection.business.businessName}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-amber-600">
                        <AlertCircle className="h-4 w-4" />
                        <span>Access Paused</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <p className="text-sm text-muted-foreground mt-4">
                Please contact the respective business administrators to restore your access.
                You won't be able to view or manage any tickets until your access is restored.
              </p>
            </CardContent>
          </Card>
        ) : !currentBusinessId ? (
          <Card>
            <CardHeader>
              <CardTitle>Select a Business</CardTitle>
              <CardDescription>
                Choose a business to view and manage their support tickets
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BusinessSwitcher
                onBusinessChange={setCurrentBusinessId}
                currentBusinessId={currentBusinessId}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Active Customer Tickets</CardTitle>
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