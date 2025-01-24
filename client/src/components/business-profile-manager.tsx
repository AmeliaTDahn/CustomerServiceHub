import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Building2, Settings } from "lucide-react";

const businessProfileSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
});

type FormData = z.infer<typeof businessProfileSchema>;

interface BusinessProfile {
  id: number;
  business_name: string;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export default function BusinessProfileManager() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profile } = useQuery<BusinessProfile>({
    queryKey: ['/api/business-profile'],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: {
      businessName: profile?.business_name || "",
    },
  });

  const updateProfile = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch("/api/business-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update business profile");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/business-profile'] });
      toast({
        title: "Success",
        description: "Business profile updated successfully",
      });
      setOpen(false);
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    },
  });

  const onSubmit = (data: FormData) => {
    updateProfile.mutate(data);
  };

  return (
    <div className="flex items-center gap-4 border rounded-lg p-4">
      <Building2 className="h-5 w-5 text-muted-foreground" />
      <div className="flex-1">
        <h3 className="font-medium">Business Profile</h3>
        <p className="text-sm text-muted-foreground">
          {profile?.business_name || "No business name set"}
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            Edit Profile
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Business Profile</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Enter your business name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={updateProfile.isPending}
              >
                {updateProfile.isPending ? "Updating..." : "Update Profile"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
