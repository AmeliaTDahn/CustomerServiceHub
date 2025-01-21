import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { User } from "lucide-react";
import { useSupabase } from "@/components/supabase-provider";

export default function UserProfile() {
  const { toast } = useToast();
  const { user } = useSupabase();

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <h2 className="text-xl font-semibold">User Profile</h2>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Email</h3>
            <p>{user.email}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}