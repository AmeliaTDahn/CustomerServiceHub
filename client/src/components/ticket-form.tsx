
import { useForm } from "react-hook-form";
import { useState } from "react";
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

interface Business {
  id: number;
  name: string;
}

type TicketFormData = NewTicket & {
  businessProfileId: number;
  category: "technical" | "billing" | "feature_request" | "general_inquiry" | "bug_report";
};

const CATEGORIES = [
  { value: "technical", label: "Technical Issue" },
  { value: "billing", label: "Billing Problem" },
  { value: "feature_request", label: "Feature Request" },
  { value: "general_inquiry", label: "General Inquiry" },
  { value: "bug_report", label: "Bug Report" },
] as const;

interface TicketFormProps {
  onSuccess?: () => void;
}

export default function TicketForm({ onSuccess }: TicketFormProps) {
  const { register, handleSubmit, reset, setValue } = useForm<TicketFormData>();
  const [open, setOpen] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all available businesses
  const { data: businesses = [] } = useQuery<Business[]>({
    queryKey: ['/api/businesses'],
    queryFn: async () => {
      const res = await fetch('/api/businesses', { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
  });

  const createTicket = useMutation({
    mutationFn: async (data: TicketFormData) => {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          category: data.category,
          priority: "medium",
          businessProfileId: data.businessProfileId
        }),
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
      setSelectedBusinessId(null);
      onSuccess?.();
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
        <Label>Select Business</Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between"
            >
              {selectedBusinessId
                ? businesses.find((business) => business.id === selectedBusinessId)?.name
                : "Search for a business..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0">
            <Command>
              <CommandInput placeholder="Search businesses..." />
              <CommandEmpty>No business found.</CommandEmpty>
              <CommandGroup>
                {businesses.map((business) => (
                  <CommandItem
                    key={business.id}
                    onSelect={() => {
                      setSelectedBusinessId(business.id);
                      setValue('businessProfileId', business.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedBusinessId === business.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {business.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select
          onValueChange={(value) => setValue('category', value as TicketFormData['category'])}
          required
          defaultValue="general_inquiry"
        >
          <SelectTrigger>
            <SelectValue placeholder="Select ticket category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((category) => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
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

      <Button type="submit" disabled={createTicket.isPending || !selectedBusinessId} className="w-full">
        {createTicket.isPending ? "Creating..." : "Create Ticket"}
      </Button>
    </form>
  );
}
