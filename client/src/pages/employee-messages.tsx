import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Search, ArrowLeft, Building2 } from "lucide-react";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TicketChat from "@/components/ticket-chat";
import { type Ticket } from "@db/schema";

interface TicketWithCustomer extends Ticket {
  customer: {
    id: number;
    username: string;
  };
  lastMessageAt?: string;
  unreadCount?: number; // Added unreadCount
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

type ChatType = 'ticket' | 'business' | 'employee';

export default function EmployeeMessages() {
  const ticketId = new URLSearchParams(window.location.search).get('ticketId');
  const { user } = useUser();
  const [ticketSearchTerm, setTicketSearchTerm] = useState("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(
    ticketId ? parseInt(ticketId) : null
  );
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [viewType, setViewType] = useState<'active' | 'resolved' | 'direct'>('active');
  const [chatType, setChatType] = useState<ChatType>('ticket');

  // Fetch all tickets with their last message timestamps
  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<TicketWithCustomer[]>({
    queryKey: ['/api/tickets']
  });

  // Fetch users for direct messaging
  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/users/staff'],
    enabled: viewType === 'direct'
  });

  // Fetch business user for direct messaging
  const { data: businessUser, isLoading: businessUserLoading } = useQuery<BusinessUser>({
    queryKey: ['/api/users/business'],
    enabled: viewType === 'direct'
  });

  // Filter users based on search term, excluding current user and business user
  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) &&
    u.id !== user?.id &&
    u.id !== businessUser?.id
  );

  // Sort tickets by last message time and status
  const sortTickets = (tickets: TicketWithCustomer[]) => {
    return [...tickets].sort((a, b) => {
      // Always put resolved tickets at the bottom
      if (a.status === 'resolved' && b.status !== 'resolved') return 1;
      if (a.status !== 'resolved' && b.status === 'resolved') return -1;

      // Sort by last message time for non-resolved tickets
      const aTime = a.lastMessageAt || a.createdAt;
      const bTime = b.lastMessageAt || b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  };

  // Filter tickets based on search term and view type
  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.title.toLowerCase().includes(ticketSearchTerm.toLowerCase()) ||
      ticket.customer.username.toLowerCase().includes(ticketSearchTerm.toLowerCase());

    const matchesViewType = viewType === 'active'
      ? ticket.status !== 'resolved'
      : ticket.status === 'resolved';

    return matchesSearch && matchesViewType;
  });

  // Sort the filtered tickets
  const sortedTickets = sortTickets(filteredTickets);

  const handleUserSelect = (userId: number, type: ChatType) => {
    setSelectedUserId(userId);
    setSelectedTicketId(null);
    setChatType(type);
  };

  const handleTicketSelect = (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setSelectedUserId(null);
    setChatType('ticket');
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

      {/* Main Content Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-3 sm:px-6 lg:px-8 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Sidebar */}
          <Card className="col-span-4 flex flex-col overflow-hidden">
            <div className="flex flex-col h-full">
              {/* View Type Selector */}
              <div className="p-4 border-b">
                <Select
                  value={viewType}
                  onValueChange={(value: 'active' | 'resolved' | 'direct') => {
                    setViewType(value);
                    if (value !== 'direct') {
                      setChatType('ticket');
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select view">
                      {viewType === 'active' && "Support Tickets"}
                      {viewType === 'resolved' && "Resolved Tickets"}
                      {viewType === 'direct' && "Direct Messages"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Support Tickets</SelectItem>
                    <SelectItem value="resolved">Resolved Tickets</SelectItem>
                    <SelectItem value="direct">Direct Messages</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search Area */}
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={viewType === "direct" ? "Search users..." : "Search tickets..."}
                    value={viewType === "direct" ? userSearchTerm : ticketSearchTerm}
                    onChange={(e) => viewType === "direct"
                      ? setUserSearchTerm(e.target.value)
                      : setTicketSearchTerm(e.target.value)
                    }
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Ticket/User List */}
              <div className="flex-1 overflow-auto">
                <CardContent className="p-0">
                  <div className="divide-y">
                    {viewType !== 'direct' ? (
                      sortedTickets.map((ticket) => (
                        <button
                          key={ticket.id}
                          onClick={() => handleTicketSelect(ticket.id)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 ${
                            selectedTicketId === ticket.id ? "bg-primary/5" : ""
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{ticket.title}</p>
                                {ticket.unreadCount > 0 && (
                                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                                <span>{ticket.customer.username}</span>
                                <span>•</span>
                                <span>{new Date(ticket.lastMessageAt || ticket.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                            <span className={`ml-2 px-2 py-1 rounded text-xs ${
                              ticket.status === 'open' ? 'bg-green-100 text-green-800' :
                                ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                            }`}>
                              {ticket.status.replace('_', ' ')}
                            </span>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="divide-y">
                        {/* Business User Section */}
                        {viewType === 'direct' && businessUser && (
                          <div className="p-4 bg-muted/50">
                            <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                              <Building2 className="h-4 w-4" />
                              Business Account
                            </h3>
                            <button
                              onClick={() => handleUserSelect(businessUser.id, 'business')}
                              className={`w-full px-4 py-3 text-left rounded-lg transition-colors ${
                                selectedUserId === businessUser.id && chatType === 'business'
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
                        {viewType === 'direct' && (
                          <div className="p-4">
                            <h3 className="text-sm font-medium text-muted-foreground mb-2">
                              Other Employees
                            </h3>
                            <div className="space-y-2">
                              {filteredUsers.map((otherUser) => (
                                <button
                                  key={otherUser.id}
                                  onClick={() => handleUserSelect(otherUser.id, 'employee')}
                                  className={`w-full px-4 py-3 text-left rounded-lg transition-colors ${
                                    selectedUserId === otherUser.id && chatType === 'employee'
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
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </div>
            </div>
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
                    chatType={chatType}
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