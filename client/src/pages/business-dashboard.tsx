import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketList from "@/components/ticket-list";
import TicketFilters from "@/components/ticket-filters";
import EmployeeManagement from "@/components/employee-management";
import InvitationHandler from "@/components/invitation-handler";
import BusinessSwitcher from "@/components/business-switcher";
import { useUser } from "@/hooks/use-user";
import { BarChart, MessageCircle, Users } from "lucide-react";
import { Link } from "wouter";
import type { Ticket } from "@db/schema";

export default function BusinessDashboard() {
  const { user, logout } = useUser();
  const [currentBusinessId, setCurrentBusinessId] = useState<string>();

  // For employees, fetch the first available business ID if none is selected
  const { data: businesses = [] } = useQuery<Array<{ id: number; username: string }>>({
    queryKey: ['/api/businesses'],
  });

  useEffect(() => {
    if (user?.role === "employee" && !currentBusinessId && businesses.length > 0) {
      setCurrentBusinessId(businesses[0].id.toString());
    }
  }, [user?.role, currentBusinessId, businesses]);

  const effectiveBusinessId = user?.role === "business" ? user.id.toString() : currentBusinessId;

  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets', effectiveBusinessId],
    enabled: !!effectiveBusinessId,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const filteredTickets = tickets?.filter((ticket) => {
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
  }) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-gray-900">
              {user?.role === "business" ? "Business" : "Employee"} Dashboard
            </h1>
            {user?.role === "employee" && (
              <BusinessSwitcher
                onBusinessChange={setCurrentBusinessId}
                currentBusinessId={currentBusinessId}
              />
            )}
          </div>
          <div className="flex items-center gap-4">
            <Link href="/messages">
              <Button variant="outline" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Messages
              </Button>
            </Link>
            <Link href="/analytics">
              <Button variant="outline" className="flex items-center gap-2">
                <BarChart className="h-4 w-4" />
                Analytics
              </Button>
            </Link>
            <span className="text-sm text-gray-500">Welcome, {user?.email}</span>
            <Button variant="outline" onClick={() => logout()}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {user?.role === "employee" && !currentBusinessId && <InvitationHandler />}

        {user?.role === "business" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Employee Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmployeeManagement />
            </CardContent>
          </Card>
        )}

        {effectiveBusinessId && (
          <Card>
            <CardHeader>
              <CardTitle>Customer Tickets</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketFilters 
                onSearchChange={setSearchTerm}
                onStatusChange={setStatusFilter}
                onCategoryChange={setCategoryFilter}
                onPriorityChange={setPriorityFilter}
                onSortChange={setSortBy}
              />
              <TicketList tickets={filteredTickets} isBusiness />
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}