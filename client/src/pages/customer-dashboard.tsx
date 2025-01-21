import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketForm from "@/components/ticket-form";
import TicketList from "@/components/ticket-list";
import TicketFilters from "@/components/ticket-filters";
import UserProfile from "@/components/user-profile";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useSupabase } from "@/components/supabase-provider";
import { MessageCircle } from "lucide-react";
import { Link } from "wouter";
import type { Ticket } from "@/lib/database.types";

export default function CustomerDashboard() {
  const { user, signOut } = useSupabase();
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
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "oldest":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
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
          <h1 className="text-3xl font-bold text-gray-900">Customer Dashboard</h1>
          <div className="flex items-center gap-4">
            <Link href="/messages">
              <Button variant="outline" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Messages
              </Button>
            </Link>
            <span className="text-sm text-gray-500">Welcome, {user?.email}</span>
            <Button variant="outline" onClick={() => signOut()}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6">
          <UserProfile />

          <Card>
            <CardHeader>
              <CardTitle>Support Tickets</CardTitle>
            </CardHeader>
            <CardContent>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Create New Ticket</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <TicketForm />
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
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
        </div>
      </main>
    </div>
  );
}