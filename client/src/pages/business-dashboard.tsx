import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TicketList from "@/components/ticket-list";
import TicketFilters from "@/components/ticket-filters";
import { useUser } from "@/hooks/use-user";
import type { Ticket } from "@db/schema";

export default function BusinessDashboard() {
  const { user, logout } = useUser();
  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets'],
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filteredTickets = tickets?.filter((ticket) => {
    const matchesSearch = searchTerm === "" || 
      ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.description.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || ticket.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  }) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Business Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">Welcome, {user?.username}</span>
            <Button variant="outline" onClick={() => logout()}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <Card>
          <CardHeader>
            <CardTitle>Customer Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <TicketFilters 
              onSearchChange={setSearchTerm}
              onStatusChange={setStatusFilter}
              onCategoryChange={setCategoryFilter}
            />
            <TicketList tickets={filteredTickets} isBusiness />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}