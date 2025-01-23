import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Search, ArrowLeft, Building2 } from "lucide-react";
import { Link } from "wouter";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import TicketChat from "@/components/ticket-chat";
import { type Ticket } from "@db/schema";

interface TicketWithCustomer extends Ticket {
  customer: {
    id: number;
    username: string;
  };
}

interface User {
  id: number;
  username: string;
  role: string;
}

interface BusinessUser {
  id: number;
  username: string;
  role: 'business';
}

export default function EmployeeMessages() {
  const ticketId = new URLSearchParams(window.location.search).get('ticketId');
  const { user } = useUser();
  const [ticketSearchTerm, setTicketSearchTerm] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    ticketId ? parseInt(ticketId) : null
  );
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<string>("tickets");

  // Fetch all tickets
  const { data: tickets = [] } = useQuery<TicketWithCustomer[]>({
    queryKey: ['/api/tickets']
  });

  // Fetch all employees and business users
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['/api/users/staff'],
    enabled: activeTab === "direct"
  });

  // Fetch connected business user
  const { data: businessUser } = useQuery<BusinessUser>({
    queryKey: ['/api/users/connected-business'],
    enabled: activeTab === "direct"
  });

  // Auto-select business user when switching to direct messages
  useEffect(() => {
    if (activeTab === "direct" && businessUser && !selectedUserId) {
      setSelectedUserId(businessUser.id);
    }
  }, [activeTab, businessUser]);

  // Filter tickets based on search term
  const filteredTickets = tickets.filter(ticket =>
    ticket.title.toLowerCase().includes(ticketSearchTerm.toLowerCase()) ||
    ticket.customer.username.toLowerCase().includes(ticketSearchTerm.toLowerCase())
  );

  // Filter users based on search term, excluding the business user
  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) &&
    u.id !== user?.id && // Exclude current user
    u.id !== businessUser?.id // Exclude business user as it's shown separately
  );

  const handleUserSelect = (userId: number) => {
    setSelectedUserId(userId);
    setSelectedTicketId(null);
  };

  const handleTicketSelect = (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setSelectedUserId(null);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Fixed Header */}
      <div className="flex items-center justify-between bg-white shadow px-4 py-2">
        <Link href="/">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          Message Center
        </h1>
        <div className="w-[88px]" /> {/* Spacer to center heading */}
      </div>

      {/* Main Content Area - Takes remaining height */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-3 sm:px-6 lg:px-8 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Sidebar */}
          <Card className="col-span-4 flex flex-col overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="w-full">
                <TabsTrigger value="tickets" className="flex-1">Support Tickets</TabsTrigger>
                <TabsTrigger value="direct" className="flex-1">Direct Messages</TabsTrigger>
              </TabsList>

              {/* Search Area - Fixed at top */}
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={activeTab === "tickets" ? "Search tickets..." : "Search users..."}
                    value={activeTab === "tickets" ? ticketSearchTerm : userSearchTerm}
                    onChange={(e) => activeTab === "tickets"
                      ? setTicketSearchTerm(e.target.value)
                      : setUserSearchTerm(e.target.value)
                    }
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Scrollable Content Area */}
              <TabsContent value="tickets" className="flex-1 border-0 m-0 p-0 overflow-auto">
                <CardContent className="p-0">
                  <div className="divide-y">
                    {filteredTickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        onClick={() => handleTicketSelect(ticket.id)}
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
                    {filteredTickets.length === 0 && ticketSearchTerm && (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        No tickets found matching "{ticketSearchTerm}"
                      </div>
                    )}
                  </div>
                </CardContent>
              </TabsContent>

              <TabsContent value="direct" className="flex-1 border-0 m-0 p-0 overflow-auto">
                <CardContent className="p-0">
                  <div className="divide-y">
                    {/* Business User Section */}
                    {businessUser && (
                      <div className="p-4 bg-muted/50">
                        <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                          <Building2 className="h-4 w-4" />
                          Business Account
                        </h3>
                        <button
                          onClick={() => handleUserSelect(businessUser.id)}
                          className={`w-full px-4 py-3 text-left rounded-lg transition-colors ${
                            selectedUserId === businessUser.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-background hover:bg-muted"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-medium">{businessUser.username}</p>
                            <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                              Business Owner
                            </span>
                          </div>
                        </button>
                      </div>
                    )}

                    {/* Other Users Section */}
                    <div className="p-4">
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">
                        Other Employees
                      </h3>
                      <div className="space-y-2">
                        {filteredUsers.map((otherUser) => (
                          <button
                            key={otherUser.id}
                            onClick={() => handleUserSelect(otherUser.id)}
                            className={`w-full px-4 py-3 text-left rounded-lg transition-colors ${
                              selectedUserId === otherUser.id
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <p className="font-medium">{otherUser.username}</p>
                              <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">
                                {otherUser.role}
                              </span>
                            </div>
                          </button>
                        ))}
                        {filteredUsers.length === 0 && userSearchTerm && (
                          <div className="text-sm text-muted-foreground">
                            No users found matching "{userSearchTerm}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </TabsContent>
            </Tabs>
          </Card>

          {/* Chat Area */}
          <Card className="col-span-8 flex flex-col overflow-hidden">
            <CardContent className="p-0 flex-1 flex flex-col h-full">
              {selectedTicketId ? (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <TicketChat
                    ticketId={selectedTicketId}
                    readonly={false}
                  />
                </div>
              ) : selectedUserId ? (
                <div className="flex-1 flex flex-col h-full overflow-hidden">
                  <TicketChat
                    directMessageUserId={selectedUserId}
                    readonly={false}
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a ticket or user to view messages
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}