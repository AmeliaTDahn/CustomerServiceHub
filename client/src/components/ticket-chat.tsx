import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtime } from "@/hooks/use-realtime";
import { Loader2, Check, CheckCheck, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { QuickReplyTemplates } from "@/components/quick-reply-templates";
import { supabase } from "@/lib/supabase";

interface Message {
  id: number;
  content: string;
  ticket_id: number | null;
  sender_id: string;
  receiver_id: string;
  status: 'sent' | 'delivered' | 'read';
  chat_initiator?: boolean;
  initiated_at?: string | null;
  business_id?: string;
  sent_at: string;
  created_at: string;
  sender: {
    id: string;
    username: string;
    role: string;
  };
}

interface TicketChatProps {
  ticketId?: number;
  directMessageUserId?: string;
  chatType?: 'ticket' | 'business' | 'employee';
  readonly?: boolean;
}

const MessageHeader = ({ username, role, isBroadcast }: { username: string; role: string; isBroadcast?: boolean }) => (
  <div className="flex items-center gap-2 mb-1">
    <p className="text-sm font-medium">{username}</p>
    {isBroadcast && (
      <span className="flex items-center gap-1 text-xs text-blue-500">
        <Megaphone className="h-3 w-3" />
        Broadcasting
      </span>
    )}
  </div>
);

export default function TicketChat({ ticketId, directMessageUserId, chatType = 'ticket', readonly = false }: TicketChatProps) {
  const [newMessage, setNewMessage] = useState("");
  const { user } = useUser();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);

  // Query for messages - either ticket messages or direct messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ticketId 
      ? ['/api/tickets', ticketId, 'messages']
      : directMessageUserId 
        ? ['/api/direct-messages', directMessageUserId]
        : [],
    queryFn: async () => {
      if (ticketId) {
        const { data, error } = await supabase
          .from('messages')
          .select(`
            *,
            sender:sender_id (
              id,
              username,
              role
            )
          `)
          .eq('ticket_id', ticketId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
      } else if (directMessageUserId) {
        const { data, error } = await supabase
          .from('messages')
          .select(`
            *,
            sender:sender_id (
              id,
              username,
              role
            )
          `)
          .or(`sender_id.eq.${user?.id},receiver_id.eq.${user?.id}`)
          .order('created_at', { ascending: true });

        if (error) throw error;
        return data || [];
      }
      return [];
    },
    enabled: !!(ticketId || directMessageUserId) && !!user
  });

  // Get ticket details if in ticket mode
  const { data: ticket } = useQuery({
    queryKey: ['/api/tickets', ticketId],
    queryFn: async () => {
      if (!ticketId) return null;
      const { data, error } = await supabase
        .from('tickets')
        .select('*, claimed_by_id')
        .eq('id', ticketId)
        .single();

      if (error) throw error;
      
      // For employees, check if they have access to the business
      if (user?.role === 'employee') {
        const { data: hasAccess } = await supabase
          .from('business_employees')
          .select('*')
          .eq('employee_id', user.id)
          .eq('business_profile_id', data.business_profile_id)
          .eq('is_active', true)
          .single();

        if (!hasAccess) {
          throw new Error('You do not have access to this ticket');
        }
      }
      
      return data;
    },
    enabled: !!ticketId && !!user
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, optimisticMessages]);

  // Subscribe to real-time updates for messages
  useEffect(() => {
    if (!ticketId && !directMessageUserId) return;

    const messageSubscription = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: ticketId 
            ? `ticket_id=eq.${ticketId}`
            : `or(sender_id.eq.${user?.id},receiver_id.eq.${user?.id})`
        },
        () => {
          queryClient.invalidateQueries({ 
            queryKey: ticketId 
              ? ['/api/tickets', ticketId, 'messages']
              : ['/api/direct-messages', directMessageUserId]
          });
        }
      )
      .subscribe();

    return () => {
      messageSubscription.unsubscribe();
    };
  }, [ticketId, directMessageUserId, user?.id, queryClient]);

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error("Not authenticated");

      let receiverId: string;
      if (ticketId) {
        // For ticket messages
        const { data: ticket } = await supabase
          .from('tickets')
          .select(`
            customer_id,
            business:business_profile_id (
              id,
              user_id
            )
          `)
          .eq('id', ticketId)
          .single();
        
        if (!ticket) throw new Error("Ticket not found");
        
        receiverId = user.role === 'customer' 
          ? ticket.business.user_id
          : ticket.customer_id;
      } else if (directMessageUserId) {
        // For direct messages
        receiverId = directMessageUserId;
      } else {
        throw new Error("Invalid message target: Must specify either ticketId or receiverId");
      }

      const message = {
        content,
        ticket_id: ticketId || null,
        sender_id: user.id,
        receiver_id: receiverId,
        status: 'sent',
        chat_initiator: messages.length === 0,
        initiated_at: messages.length === 0 ? new Date().toISOString() : null,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('messages')
        .insert(message)
        .select(`
          *,
          sender:sender_id (
            id,
            username,
            role
          )
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onMutate: async (content) => {
      if (!user) return;

      const optimisticMessage: Message = {
        id: Date.now(),
        content,
        ticket_id: ticketId || null,
        sender_id: user.id,
        receiver_id: directMessageUserId || '',
        status: 'sending',
        chat_initiator: messages.length === 0,
        initiated_at: messages.length === 0 ? new Date().toISOString() : null,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        sender: {
          id: user.id,
          username: user.username,
          role: user.role
        }
      };

      setOptimisticMessages(prev => [...prev, optimisticMessage]);
      return { optimisticMessage };
    },
    onError: (error) => {
      setOptimisticMessages([]);
      toast({
        variant: "destructive",
        title: "Error sending message",
        description: error.message
      });
    },
    onSettled: () => {
      setOptimisticMessages([]);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || readonly || !user || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(newMessage.trim());
    setNewMessage("");
  };

  const allMessages = [...messages, ...optimisticMessages];

  const handleTemplateSelect = (template: string) => {
    setNewMessage(template);
  };

  return (
    <div className="flex flex-col h-full relative">
      {!readonly && chatType === 'ticket' && ticket && messages.length === 0 && user?.role === 'customer' && (
        <>
          <div className="bg-blue-50 text-blue-700 px-4 py-2 text-sm flex items-center gap-2 absolute top-0 left-0 right-0 z-10">
            <Megaphone className="h-4 w-4" />
            Your message will be sent to support staff.
          </div>
          <div className="flex-1 flex items-center justify-center p-4 text-muted-foreground text-center">
            <div>
              <Clock className="h-8 w-8 mx-auto mb-2 animate-pulse" />
              <p>Waiting for a support representative to respond...</p>
              <p className="text-sm mt-1">We'll notify you when someone replies to your ticket.</p>
            </div>
          </div>
        </>
      )}

      <ScrollArea className="flex-1 px-4">
        <div className="space-y-4 py-4">
          <AnimatePresence initial={false}>
            {allMessages?.map((messageData) => (
              <motion.div
                key={messageData.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`flex ${
                  messageData.sender.id === user?.id ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg p-3",
                    messageData.sender.id === user?.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <MessageHeader
                    username={messageData.sender.username}
                    role={messageData.sender.role}
                    isBroadcast={
                      messageData.sender.id === user?.id &&
                      chatType === 'ticket' &&
                      user?.role === 'customer' &&
                      ticket &&
                      !ticket.claimed_by_id
                    }
                  />
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {messageData.content}
                  </p>
                  <div className="flex items-center justify-between mt-1 text-xs opacity-70">
                    <span>{new Date(messageData.sent_at).toLocaleTimeString()}</span>
                    {messageData.sender.id === user?.id && (
                      <span className="ml-2 flex items-center gap-1">
                        {messageData.status === 'sending' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : messageData.status === 'sent' ? (
                          <Check className="h-3 w-3" />
                        ) : messageData.status === 'delivered' ? (
                          <CheckCheck className="h-3 w-3" />
                        ) : messageData.status === 'read' ? (
                          <motion.span
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className="text-blue-500"
                          >
                            <CheckCheck className="h-3 w-3" />
                          </motion.span>
                        ) : null}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {allMessages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No messages yet
            </p>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {!readonly && (
        <div className="border-t p-4 bg-background mt-auto">
          <form onSubmit={handleSubmit} className="flex gap-2">
            {(user?.role === 'business' || user?.role === 'employee') && (
              <QuickReplyTemplates onSelectTemplate={handleTemplateSelect} />
            )}
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder={
                user && user.id ? "Type your message..." : "Connecting..."
              }
              className="flex-1"
              disabled={!user || sendMessageMutation.isPending}
            />
            <Button
              type="submit"
              disabled={!newMessage.trim() || !user || sendMessageMutation.isPending}
              className="relative"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Send"
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}