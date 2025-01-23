import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Star, StarOff } from "lucide-react";

interface TicketFeedbackProps {
  ticketId: number;
  isResolved: boolean;
}

export default function TicketFeedback({ ticketId, isResolved }: TicketFeedbackProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing feedback for this ticket
  const { data: existingFeedback, isLoading } = useQuery({
    queryKey: [`/api/tickets/${ticketId}/feedback`],
    enabled: isResolved, // Only fetch if ticket is resolved
  });

  const submitFeedback = useMutation({
    mutationFn: async (data: { rating: number; comment: string }) => {
      const res = await fetch(`/api/tickets/${ticketId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: Number(data.rating),
          comment: data.comment
        }),
        credentials: "include",
      });

      const responseData = await res.json();
      if (!res.ok) {
        throw new Error(responseData.error || 'Failed to submit feedback');
      }
      return responseData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticketId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/tickets/${ticketId}/feedback`] });
      setIsOpen(false);
      setRating(0);
      setComment("");
      toast({
        title: "Success",
        description: "Thank you for your feedback!",
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
    if (rating === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a rating",
      });
      return;
    }
    submitFeedback.mutate({ rating, comment });
  };

  const renderStars = (displayRating: number) => {
    return (
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((value) => (
          <div
            key={value}
            className="text-yellow-400"
          >
            {value <= displayRating ? (
              <Star className="w-6 h-6 fill-current" />
            ) : (
              <StarOff className="w-6 h-6" />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Show loading state
  if (isLoading) {
    return (
      <Button variant="outline" size="sm" disabled className="w-full">
        Loading...
      </Button>
    );
  }

  // If feedback already exists, show it
  if (existingFeedback) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Your Rating</span>
          {renderStars(existingFeedback.rating)}
        </div>
        {existingFeedback.comment && (
          <div className="space-y-1">
            <span className="text-sm font-medium">Your Comment</span>
            <p className="text-sm text-muted-foreground">{existingFeedback.comment}</p>
          </div>
        )}
      </div>
    );
  }

  // If ticket is not resolved, show disabled button
  if (!isResolved) {
    return (
      <Button variant="outline" size="sm" disabled className="w-full">
        Feedback available after resolution
      </Button>
    );
  }

  // Show feedback form
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          Leave Feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rate Your Support Experience</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Rating</label>
            <div className="flex justify-center">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className="text-yellow-400 hover:scale-110 transition-transform"
                  >
                    {value <= rating ? (
                      <Star className="w-8 h-8 fill-current" />
                    ) : (
                      <StarOff className="w-8 h-8" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Additional Comments</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience..."
              className="min-h-[100px]"
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={submitFeedback.isPending}
          >
            Submit Feedback
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}