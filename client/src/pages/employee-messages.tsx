import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Search, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import TicketChat from "@/components/ticket-chat";
import { type Ticket } from "@db/schema";

interface TicketWithCustomer extends Ticket {
  customer: {
    id: number;
    username: string;
  };
}

export default function EmployeeMessages() {
  const ticketId = new URLSearchParams(window.location.search).get('ticketId');
  const { user } = useUser();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    ticketId ? parseInt(ticketId) : null
  );

  // Fetch all tickets
  const { data: tickets = [] } = useQuery<TicketWithCustomer[]>({
    queryKey: ['/api/tickets'],
  });

  // Filter tickets based on search term
  const filteredTickets = tickets.filter(ticket =>
    ticket.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ticket.customer.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <div className="p-2">
        <Link href="/">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="h-8 w-8" />
            Message Center
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-16rem)]">
          {/* Tickets Sidebar */}
          <Card className="col-span-4 flex flex-col">
            <CardHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tickets..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
              <div className="divide-y">
                {filteredTickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                      selectedTicketId === ticket.id ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{ticket.title}</p>
                      <span className={`px-2 py-1 rounded text-xs ${
                        ticket.status === 'open' ? 'bg-green-100 text-green-800' :
                        ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {ticket.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {ticket.customer.username}
                      </p>
                      <span className="text-xs text-muted-foreground">•</span>
                      <p className="text-xs text-muted-foreground">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                ))}
                {filteredTickets.length === 0 && searchTerm && (
                  <div className="px-4 py-3 text-sm text-muted-foreground">
                    No tickets found matching "{searchTerm}"
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Chat Area */}
          <Card className="col-span-8 flex flex-col h-full">
            <CardContent className="p-0 flex-1">
              {selectedTicketId ? (
                <div className="h-full">
                  <TicketChat ticketId={selectedTicketId} />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a ticket to view messages
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}