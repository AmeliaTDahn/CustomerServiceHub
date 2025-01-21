import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import TicketForm from "@/components/ticket-form";
import TicketList from "@/components/ticket-list";
import TicketFilters from "@/components/ticket-filters";
import UserProfile from "@/components/user-profile";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { useSupabase } from "@/components/supabase-provider";
import { MessageCircle, Search } from "lucide-react";
import { Link } from "wouter";
import type { Ticket, Profile } from "@/lib/database.types";

export default function CustomerDashboard() {
  const { user, signOut, supabase } = useSupabase();
  const [searchTerm, setSearchTerm] = useState("");
  const [businessSearchTerm, setBusinessSearchTerm] = useState("");
  const [selectedBusiness, setSelectedBusiness] = useState<Profile | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets'],
  });

  // Query to fetch businesses based on search term
  const { data: businesses } = useQuery<Profile[]>({
    queryKey: ['/api/businesses', businessSearchTerm],
    queryFn: async () => {
      if (!businessSearchTerm.trim()) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'business')
        .ilike('company_name', `%${businessSearchTerm}%`);

      if (error) throw error;
      return data;
    },
  });

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
                <DialogContent className="sm:max-w-[600px]">
                  <div className="space-y-4">
                    {!selectedBusiness ? (
                      <div className="space-y-4">
                        <h2 className="text-lg font-semibold">Search for a Business</h2>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Search businesses by name..."
                            value={businessSearchTerm}
                            onChange={(e) => setBusinessSearchTerm(e.target.value)}
                            className="flex-1"
                          />
                          <Button variant="outline" size="icon">
                            <Search className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="max-h-[200px] overflow-y-auto space-y-2">
                          {businesses?.map((business) => (
                            <div
                              key={business.id}
                              className="p-3 rounded-lg border cursor-pointer hover:bg-gray-50"
                              onClick={() => setSelectedBusiness(business)}
                            >
                              <div className="font-medium">{business.company_name || business.username}</div>
                              {business.description && (
                                <p className="text-sm text-muted-foreground">{business.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-center">
                          <h2 className="text-lg font-semibold">Create Ticket for {selectedBusiness.company_name}</h2>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedBusiness(null)}
                          >
                            Change Business
                          </Button>
                        </div>
                        <TicketForm businessId={selectedBusiness.id} />
                      </>
                    )}
                  </div>
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