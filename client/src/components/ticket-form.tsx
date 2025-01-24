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

interface Business {
  id: number;
  name: string;
  userId: number;
}

type TicketFormData = {
  title: string;
  description: string;
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
  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<TicketFormData>();
  const [open, setOpen] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all available businesses
  const { data: businesses = [], isLoading: isLoadingBusinesses } = useQuery<Business[]>({
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
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
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
              disabled={isLoadingBusinesses}
            >
              {isLoadingBusinesses ? (
                "Loading businesses..."
              ) : selectedBusinessId ? (
                businesses.find((business) => business.id === selectedBusinessId)?.name
              ) : (
                "Search for a business..."
              )}
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
        {errors.category && (
          <p className="text-sm text-red-500">{errors.category.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          {...register("title", { required: "Title is required" })}
          placeholder="Brief description of the issue"
        />
        {errors.title && (
          <p className="text-sm text-red-500">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          {...register("description", { required: "Description is required" })}
          placeholder="Detailed explanation of your issue"
          rows={4}
        />
        {errors.description && (
          <p className="text-sm text-red-500">{errors.description.message}</p>
        )}
      </div>

      <Button 
        type="submit" 
        disabled={createTicket.isPending || !selectedBusinessId || isLoadingBusinesses} 
        className="w-full"
      >
        {createTicket.isPending ? "Creating..." : "Create Ticket"}
      </Button>
    </form>
  );
}