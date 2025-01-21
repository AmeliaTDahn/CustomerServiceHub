import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { TicketNote } from "@db/schema";

interface TicketNotesProps {
  ticketId: number;
}

export default function TicketNotes({ ticketId }: TicketNotesProps) {
  const [newNote, setNewNote] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: notes = [] } = useQuery<TicketNote[]>({
    queryKey: [`/api/tickets/${ticketId}/notes`],
  });

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
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticketId}/notes`] });
      setNewNote("");
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    addNote.mutate(newNote.trim());
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Private Notes</h3>
      <ScrollArea className="h-[200px] border rounded-lg p-4">
        <div className="space-y-4">
          {notes.map((note) => (
            <div key={note.id} className="bg-muted p-3 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {new Date(note.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
          {notes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No notes yet
            </p>
          )}
        </div>
      </ScrollArea>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a private note..."
          className="flex-1"
        />
        <Button type="submit" disabled={addNote.isPending || !newNote.trim()}>
          Add Note
        </Button>
      </form>
    </div>
  );
}
