import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { NewTicket } from "@db/schema";
import { useState } from "react";

interface Business {
  id: number;
  username: string;
}

type TicketFormData = NewTicket & {
  businessId: number;
  category: string;
};

const CATEGORIES = [
  { value: "technical", label: "Technical Issue" },
  { value: "billing", label: "Billing Problem" },
  { value: "feature_request", label: "Feature Request" },
  { value: "general_inquiry", label: "General Inquiry" },
  { value: "bug_report", label: "Bug Report" },
];

export default function TicketForm() {
  const { register, handleSubmit, reset, setValue } = useForm<TicketFormData>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

  // Fetch available businesses
  const { data: businesses } = useQuery<Business[]>({
    queryKey: ['/api/businesses'],
  });

  const createTicket = useMutation({
    mutationFn: async (data: TicketFormData) => {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, priority: "medium" }),
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
      setSelectedBusiness(null);
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
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between"
            >
              {selectedBusiness ? selectedBusiness.username : "Search for a business..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder="Search for a business..." />
              <CommandEmpty>No business found.</CommandEmpty>
              <CommandGroup>
                {businesses?.map((business) => (
                  <CommandItem
                    key={business.id}
                    onSelect={() => {
                      setSelectedBusiness(business);
                      setValue('businessId', business.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedBusiness?.id === business.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {business.username}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2"
          onChange={(e) => setValue('category', e.target.value)}
          required
          defaultValue="general_inquiry"
        >
          {CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
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