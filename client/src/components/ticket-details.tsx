import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";

interface TicketNote {
  id: number;
  content: string;
  userId: number;
  userType: string;
  createdAt: string;
}

interface ChatMessage {
  id: number;
  content: string;
  senderId: number;
  senderType: string;
  createdAt: string;
}

interface TicketDetailsProps {
  ticketId: number;
}

export default function TicketDetails({ ticketId }: TicketDetailsProps) {
  const [noteContent, setNoteContent] = useState("");
  const [messageContent, setMessageContent] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch notes
  const { data: notes = [] } = useQuery<TicketNote[]>({
    queryKey: ['/api/tickets', ticketId, 'notes'],
  });

  // Fetch chat messages
  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ['/api/tickets', ticketId, 'chat'],
  });

  // Add note mutation
  const addNote = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/tickets/${ticketId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets', ticketId, 'notes'] });
      setNoteContent("");
      toast({
        title: "Success",
        description: "Note added successfully",
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

  // Send message mutation
  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(`/api/tickets/${ticketId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets', ticketId, 'chat'] });
      setMessageContent("");
      toast({
        title: "Success",
        description: "Message sent successfully",
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

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Notes section */}
      <div className="space-y-4">
        <h3 className="font-semibold">Internal Notes</h3>
        <ScrollArea className="h-[300px] border rounded-md p-4">
          <div className="space-y-4">
            {notes.map((note) => (
              <div key={note.id} className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  {note.userType} • {format(new Date(note.createdAt), 'MMM d, h:mm a')}
                </p>
                <p className="text-sm">{note.content}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="space-y-2">
          <Textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Add an internal note..."
            rows={3}
          />
          <Button 
            onClick={() => addNote.mutate(noteContent)}
            disabled={addNote.isPending || !noteContent.trim()}
          >
            Add Note
          </Button>
        </div>
      </div>

      {/* Chat section */}
      <div className="space-y-4">
        <h3 className="font-semibold">Customer Chat</h3>
        <ScrollArea className="h-[300px] border rounded-md p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  {message.senderType} • {format(new Date(message.createdAt), 'MMM d, h:mm a')}
                </p>
                <p className="text-sm">{message.content}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div className="space-y-2">
          <Textarea
            value={messageContent}
            onChange={(e) => setMessageContent(e.target.value)}
            placeholder="Type your message..."
            rows={3}
          />
          <Button 
            onClick={() => sendMessage.mutate(messageContent)}
            disabled={sendMessage.isPending || !messageContent.trim()}
          >
            Send Message
          </Button>
        </div>
      </div>
    </div>
  );
}
