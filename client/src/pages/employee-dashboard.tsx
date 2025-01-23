import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketList from "@/components/ticket-list";
import TicketFilters from "@/components/ticket-filters";
import InvitationHandler from "@/components/invitation-handler";
import { useUser } from "@/hooks/use-user";
import { MessageCircle } from "lucide-react";
import { Link } from "wouter";
import type { Ticket } from "@db/schema";

export default function EmployeeDashboard() {
  const { user, logout } = useUser();

  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets'],
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  // Filter out resolved tickets first, then apply other filters
  const activeTickets = tickets?.filter(ticket => ticket.status !== "resolved") || [];

  const filteredTickets = activeTickets.filter((ticket) => {
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
            <h1 className="text-xl font-semibold">Employee Dashboard</h1>
            <div className="flex items-center gap-4">
              <Link href="/messages">
                <Button variant="outline" size="sm" className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Messages
                  {tickets?.some(t => t.unreadCount > 0) && (
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  )}
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
      </main>
    </div>
  );
}