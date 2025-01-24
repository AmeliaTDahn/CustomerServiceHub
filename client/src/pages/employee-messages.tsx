import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useUser } from "@/hooks/use-user";
import { MessageCircle, Search, ArrowLeft, Building2, AlertCircle } from "lucide-react";
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
    id: string;
    username: string;
  };
  lastMessageAt?: string;
  unreadCount?: number;
}

interface User {
  id: string;
  username: string;
  role: string;
}

interface BusinessUser {
  id: string;
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'active' | 'resolved' | 'direct'>('active');
  const [chatType, setChatType] = useState<ChatType>('ticket');
  const queryClient = useQueryClient();

  const [selectedBusinessId, setSelectedBusinessId] = useState<string>("all");

  // Fetch businesses where employee has connections
  const { data: businesses = [] } = useQuery({
    queryKey: ['/api/employees/active-businesses'],
    queryFn: async () => {
      const res = await fetch('/api/employees/active-businesses', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  // Fetch only tickets claimed by the current employee
  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<TicketWithCustomer[]>({
    queryKey: ['/api/tickets/claimed'],
    queryFn: async () => {
      const res = await fetch('/api/tickets/claimed', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  // Filter tickets by selected business
  const filteredTickets = tickets.filter(ticket => 
    selectedBusinessId === "all" || ticket.business_profile_id.toString() === selectedBusinessId
  );

  // Fetch users for direct messaging
  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/users/staff'],
    enabled: viewType === 'direct'
  });

  // Fetch business users for direct messaging
  const { data: businessUsers = [], isLoading: businessUsersLoading } = useQuery<BusinessUser[]>({
    queryKey: ['/api/users/business'],
    enabled: viewType === 'direct'
  });

  // Force refresh when switching view types
  useEffect(() => {
    if (viewType === 'direct') {
      queryClient.invalidateQueries({ queryKey: ['/api/messages/direct'] });
    }
  }, [viewType, queryClient]);

  // Filter tickets based on search term and status
  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = 
      ticket.title.toLowerCase().includes(ticketSearchTerm.toLowerCase()) ||
      ticket.customer.username.toLowerCase().includes(ticketSearchTerm.toLowerCase());

    const matchesViewType = viewType === 'active' 
      ? ticket.status !== 'resolved'
      : ticket.status === 'resolved';

    return matchesSearch && matchesViewType;
  });

  // Sort tickets by last message time
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const aTime = a.lastMessageAt || a.createdAt;
    const bTime = b.lastMessageAt || b.createdAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  // Filter users for direct messaging
  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(userSearchTerm.toLowerCase()) &&
    u.id !== user?.id
  );

  const handleTicketSelect = (ticketId: number) => {
    setSelectedTicketId(ticketId);
    setSelectedUserId(null);
    setChatType('ticket');
  };

  const handleUserSelect = (userId: string, type: ChatType) => {
    setSelectedUserId(userId);
    setSelectedTicketId(null);
    setChatType(type);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
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
        <div className="w-[88px]" />
      </div>

      {/* Main Content */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-3 sm:px-6 lg:px-8 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Sidebar */}
          <Card className="col-span-4 flex flex-col overflow-hidden">
            <div className="flex flex-col h-full">
              {/* Business Filter */}
              <div className="p-4 border-b">
                <Select
                  value={selectedBusinessId}
                  onValueChange={setSelectedBusinessId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by business">
                      {selectedBusinessId === "all" 
                        ? "All Businesses" 
                        : businesses.find(b => b.business.id.toString() === selectedBusinessId)?.business.business_name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Businesses</SelectItem>
                    {businesses.map((conn) => (
                      <SelectItem key={conn.business.id} value={conn.business.id.toString()}>
                        {conn.business.business_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* View Type Selector */}
              <div className="p-4 border-b">
                <Select
                  value={viewType}
                  onValueChange={(value: 'active' | 'resolved' | 'direct') => {
                    setViewType(value);
                    setSelectedTicketId(null);
                    setSelectedUserId(null);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select view">
                      {viewType === 'active' && "Customer Chats"}
                      {viewType === 'resolved' && "Resolved Chats"}
                      {viewType === 'direct' && "Team Messages"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Customer Chats</SelectItem>
                    <SelectItem value="resolved">Resolved Chats</SelectItem>
                    <SelectItem value="direct">Team Messages</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search */}
              <div className="p-4 border-b">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={viewType === "direct" ? "Search team members..." : "Search customer chats..."}
                    value={viewType === "direct" ? userSearchTerm : ticketSearchTerm}
                    onChange={(e) => viewType === "direct"
                      ? setUserSearchTerm(e.target.value)
                      : setTicketSearchTerm(e.target.value)
                    }
                    className="pl-9"
                  />
                </div>
              </div>

              {/* Chat List */}
              <div className="flex-1 overflow-auto">
                <CardContent className="p-0">
                  {viewType !== 'direct' ? (
                    <div className="divide-y">
                      {filteredTickets.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground flex items-center justify-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          <span>No {viewType === 'active' ? 'active' : 'resolved'} customer chats</span>
                        </div>
                      ) : (
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
                                  <p className="font-medium truncate">{ticket.customer.username}</p>
                                  {ticket.unreadCount && ticket.unreadCount > 0 && (
                                    <span className="inline-flex items-center justify-center bg-primary text-primary-foreground text-xs rounded-full h-5 min-w-[1.25rem] px-1">
                                      {ticket.unreadCount}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground truncate">
                                  {ticket.title}
                                </p>
                                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{new Date(ticket.lastMessageAt || ticket.createdAt).toLocaleDateString()}</span>
                                  <span>•</span>
                                  <span className={`capitalize ${
                                    ticket.status === 'open' ? 'text-green-600' :
                                    ticket.status === 'in_progress' ? 'text-blue-600' :
                                    'text-gray-600'
                                  }`}>
                                    {ticket.status.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  ) : (
                    // Team Messages Section
                    <div className="divide-y">
                      {/* Business Users Section */}
                      {businessUsers.length > 0 && (
                        <div className="p-4 bg-muted/50">
                          <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            Business Team
                          </h3>
                          <div className="space-y-2">
                            {businessUsers.map((businessUser) => (
                              <button
                                key={businessUser.id}
                                onClick={() => handleUserSelect(businessUser.id, 'business')}
                                className={`w-full px-4 py-3 text-left rounded-lg transition-colors ${
                                  selectedUserId === businessUser.id && chatType === 'business'
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-muted"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <p className="font-medium">{businessUser.username}</p>
                                  <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
                                    Business Owner
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Other Team Members */}
                      <div className="p-4">
                        <h3 className="text-sm font-medium text-muted-foreground mb-2">
                          Team Members
                        </h3>
                        <div className="space-y-2">
                          {filteredUsers.map((teamMember) => (
                            <button
                              key={teamMember.id}
                              onClick={() => handleUserSelect(teamMember.id, 'employee')}
                              className={`w-full px-4 py-3 text-left rounded-lg transition-colors ${
                                selectedUserId === teamMember.id && chatType === 'employee'
                                  ? "bg-primary text-primary-foreground"
                                  : "hover:bg-muted"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <p className="font-medium">{teamMember.username}</p>
                                <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">
                                  {teamMember.role}
                                </span>
                              </div>
                            </button>
                          ))}
                          {filteredUsers.length === 0 && userSearchTerm && (
                            <div className="text-sm text-muted-foreground">
                              No team members found matching "{userSearchTerm}"
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </div>
            </div>
          </Card>

          {/* Chat Area */}
          <Card className="col-span-8 flex flex-col overflow-hidden">
            <CardContent className="p-0 flex-1 flex flex-col h-full">
              {selectedTicketId ? (
                <TicketChat
                  ticketId={selectedTicketId}
                  readonly={false}
                />
              ) : selectedUserId ? (
                <TicketChat
                  directMessageUserId={selectedUserId}
                  chatType={chatType}
                  readonly={false}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  Select a conversation to start messaging
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}