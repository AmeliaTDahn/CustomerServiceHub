import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/hooks/use-user";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Lock, Unlock } from "lucide-react";
import { useLocation } from "wouter";
import type { Ticket } from "@db/schema";
import TicketNotes from "./ticket-notes";
import TicketFeedback from "./ticket-feedback";

interface TicketListProps {
  tickets: (Ticket & {
    customer: { id: number; username: string };
    business: { id: number; username: string };
    hasBusinessResponse?: boolean;
    hasFeedback?: boolean;
    unreadCount: number;
    claimedById?: number | null;
    claimedAt?: string | null;
    category: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
  })[];
  isBusiness?: boolean;
  isEmployee?: boolean;
  userId?: number;
  readonly?: boolean;
}

export default function TicketList({
  tickets,
  isBusiness = false,
  isEmployee = false,
  userId,
  readonly = false
}: TicketListProps) {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [viewType, setViewType] = useState<'active' | 'my-tickets' | 'history'>('active');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filter tickets based on view type and claim status
  const { user } = useUser();
  
  const filterTickets = (tickets: TicketListProps['tickets'], view: 'active' | 'my-tickets' | 'history') => {
    if (!tickets) return [];
    
    return tickets.filter(ticket => {
      const isResolved = ticket.status === "resolved";
      const isClaimedByMe = ticket.claimed_by_id === user?.id;
      const isClaimedByAnyone = ticket.claimed_by_id !== null;

      if (isEmployee) {
        switch (view) {
          case 'active':
            // Show only unresolved and unclaimed tickets
            return !isResolved && !isClaimedByAnyone;
          case 'my-tickets':
            // Show unresolved tickets that are claimed by current employee
            return !isResolved && isClaimedByMe;
          case 'history':
            // Show resolved tickets that were resolved by this employee
            return isResolved && isClaimedByMe;
          default:
            return false;
        }
      }

      // For non-employee views
      return view === 'history' ? isResolved : !isResolved;
    });
  };

  const sortTickets = (tickets: TicketListProps['tickets']) => {
    return [...tickets].sort((a, b) => {
      // First, separate resolved and unresolved tickets
      if (a.status === 'resolved' && b.status !== 'resolved') return 1;
      if (a.status !== 'resolved' && b.status === 'resolved') return -1;

      // Then sort by date
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  };

  const handleMessageClick = (ticketId: number) => {
    const [, setLocation] = useLocation();
    setLocation(`/messages?ticketId=${ticketId}`);
  };

  const claimTicket = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await fetch(`/api/tickets/${ticketId}/claim`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      toast({
        title: "Success",
        description: "Ticket claimed successfully",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    },
  });

  const unclaimTicket = useMutation({
    mutationFn: async (ticketId: number) => {
      const res = await fetch(`/api/tickets/${ticketId}/unclaim`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      toast({
        title: "Success",
        description: "Ticket unclaimed successfully",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    },
  });

  // Animation variants for the ticket cards
  const ticketVariants = {
    initial: {
      opacity: 0,
      y: 20,
      scale: 0.95
    },
    animate: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        duration: 0.2
      }
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.15
      }
    },
    claimed: {
      scale: 1.02,
      borderColor: "hsl(var(--primary))",
      transition: {
        duration: 0.2
      }
    },
    unclaimed: {
      scale: 1,
      borderColor: "hsl(var(--border))",
      transition: {
        duration: 0.2
      }
    }
  };

  return (
    <div>
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="flex items-center justify-end h-12 px-4">
          <Select
            value={viewType}
            onValueChange={(value: 'active' | 'my-tickets' | 'history') => setViewType(value)}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Select view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Tickets</SelectItem>
              {isEmployee && <SelectItem value="my-tickets">My Tickets</SelectItem>}
              <SelectItem value="history">Ticket History</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-4 py-2 space-y-2">
        <AnimatePresence mode="popLayout">
          {filterTickets(tickets, viewType).map((ticket) => (
            <motion.div
              key={ticket.id}
              layout
              initial="initial"
              animate="animate"
              exit="exit"
              variants={ticketVariants}
              layoutId={`ticket-${ticket.id}`}
            >
              <Card
                className={`cursor-pointer hover:shadow-md transition-shadow ${
                  ticket.claimedById === userId ? 'border-l-4 border-l-primary' : ''
                }`}
              >
                <motion.div 
                  className="p-4"
                  animate={ticket.claimedById === userId ? "claimed" : "unclaimed"}
                  variants={ticketVariants}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1" onClick={() => setSelectedTicket(ticket)}>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium truncate">{ticket.title}</h3>
                        {ticket.unreadCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {ticket.unreadCount} new
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{ticket.customer?.username}</span>
                          <span>·</span>
                          <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                          <Badge variant={ticket.status === "resolved" ? "secondary" : "default"}>
                            {ticket.status === "in_progress" ? "In Progress" :
                             ticket.status === "resolved" ? "Resolved" : "Open"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="capitalize">
                            {ticket.category.replace(/_/g, ' ')}
                          </Badge>
                          <Badge variant="outline" className={`capitalize ${
                            ticket.priority === 'urgent' ? 'border-red-500 text-red-500' :
                            ticket.priority === 'high' ? 'border-orange-500 text-orange-500' :
                            ticket.priority === 'medium' ? 'border-yellow-500 text-yellow-500' :
                            'border-blue-500 text-blue-500'
                          }`}>
                            {ticket.priority}
                          </Badge>
                          {ticket.claimedById && (
                            <Badge variant="outline" className="text-xs">
                              {ticket.claimedById === userId ? 'Claimed by you' : 'Claimed'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEmployee && !readonly && !ticket.claimedById && (
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Button
                            variant="default"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              claimTicket.mutate(ticket.id);
                            }}
                            disabled={claimTicket.isPending}
                            className="whitespace-nowrap"
                          >
                            <Lock className="mr-2 h-4 w-4" />
                            Claim
                          </Button>
                        </motion.div>
                      )}
                      {isEmployee && !readonly && ticket.claimedById === userId && (
                        <motion.div
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              unclaimTicket.mutate(ticket.id);
                            }}
                            disabled={unclaimTicket.isPending}
                            className="whitespace-nowrap"
                          >
                            <Unlock className="mr-2 h-4 w-4" />
                            Release
                          </Button>
                        </motion.div>
                      )}
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMessageClick(ticket.id);
                          }}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
        {filterTickets(tickets, viewType).length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center text-sm text-muted-foreground py-8"
          >
            No {viewType === 'active' ? 'active' : viewType === 'my-tickets' ? 'claimed' : 'resolved'} tickets
          </motion.div>
        )}
      </div>

      <Dialog open={selectedTicket !== null} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="max-w-2xl">
          {selectedTicket && (
            <div className="flex flex-col">
              <DialogHeader>
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <DialogTitle>{selectedTicket.title}</DialogTitle>
                    <DialogDescription>
                      Created on {new Date(selectedTicket.createdAt).toLocaleDateString()}
                    </DialogDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleMessageClick(selectedTicket.id)}
                    className="flex items-center gap-2"
                  >
                    <MessageCircle className="h-4 w-4" />
                    View Messages
                  </Button>
                </div>
              </DialogHeader>

              <div className="mt-4">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Description</h3>
                    <div className="prose prose-sm max-w-none bg-muted p-3 rounded-lg">
                      <p>{selectedTicket.description}</p>
                    </div>
                  </div>

                  {isEmployee && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Actions</h3>
                      <div className="flex gap-2">
                        <Select
                          value={selectedTicket?.status}
                          onValueChange={async (status) => {
                            try {
                              const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
                                method: 'PATCH',
                                headers: {
                                  'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ status }),
                                credentials: 'include'
                              });
                              if (!res.ok) throw new Error(await res.text());
                              queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
                              toast({
                                title: "Success",
                                description: "Ticket status updated successfully",
                              });
                            } catch (error) {
                              toast({
                                variant: "destructive",
                                title: "Error",
                                description: (error as Error).message,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {(isBusiness || isEmployee) && (
                    <div className="mt-6">
                      <ScrollArea className="h-[200px] rounded-md border p-4">
                        <TicketNotes ticketId={selectedTicket.id} />
                      </ScrollArea>
                    </div>
                  )}

                  {!isBusiness && !isEmployee && selectedTicket.status === "resolved" && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium">Feedback</h3>
                      <div className="bg-muted rounded-lg p-4">
                        <TicketFeedback
                          ticketId={selectedTicket.id}
                          isResolved={true}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}