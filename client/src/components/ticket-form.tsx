import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { NewTicket } from "@db/schema";

interface Business {
  id: number;
  username: string;
}

type TicketFormData = NewTicket & {
  businessId: number;
};

export default function TicketForm() {
  const { register, handleSubmit, reset, setValue, watch } = useForm<TicketFormData>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available businesses
  const { data: businesses } = useQuery<Business[]>({
    queryKey: ['/api/businesses'],
  });

  const createTicket = useMutation({
    mutationFn: async (data: TicketFormData) => {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
      toast({
        title: "Success",
        description: "Ticket created successfully",
      });
      reset();
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
    <form
      onSubmit={handleSubmit((data) => createTicket.mutate(data))}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="businessId">Select Business</Label>
        <Select
          onValueChange={(value) => setValue('businessId', parseInt(value))}
          required
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a business" />
          </SelectTrigger>
          <SelectContent>
            {businesses?.map((business) => (
              <SelectItem key={business.id} value={business.id.toString()}>
                {business.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          {...register("title", { required: true })}
          placeholder="Brief description of the issue"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          {...register("description", { required: true })}
          placeholder="Detailed explanation of your issue"
          rows={4}
        />
      </div>
      <Button type="submit" disabled={createTicket.isPending}>
        {createTicket.isPending ? "Creating..." : "Create Ticket"}
      </Button>
    </form>
  );
}