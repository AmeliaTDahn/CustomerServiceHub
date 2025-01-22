import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketForm from "@/components/ticket-form";
import TicketList from "@/components/ticket-list";
import TicketFilters from "@/components/ticket-filters";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Plus } from "lucide-react";
import { Link } from "wouter";
import type { Ticket } from "@db/schema";

export default function CustomerDashboard() {
  const { user, logout } = useUser();
  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets'],
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
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <div className="flex flex-1 items-center justify-between">
            <h1 className="text-xl font-semibold">Customer Dashboard</h1>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Support Tickets</CardTitle>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create New Ticket
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <TicketForm />
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-6">
            <TicketFilters 
              onSearchChange={setSearchTerm}
              onStatusChange={setStatusFilter}
              onCategoryChange={setCategoryFilter}
              onPriorityChange={setPriorityFilter}
              onSortChange={setSortBy}
            />
            <TicketList tickets={filteredTickets} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}