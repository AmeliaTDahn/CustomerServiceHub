import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { User, Save } from "lucide-react";
import { useSupabase } from "@/components/supabase-provider";

export default function UserProfile() {
  const { toast } = useToast();
  const { user, supabase } = useSupabase();
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState(user?.user_metadata?.username || '');
  const [isLoading, setIsLoading] = useState(false);

  if (!user) return null;

  const isEmployee = user.user_metadata.role === 'employee';

  const handleSave = async () => {
    if (!username.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Username cannot be empty",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          username: username.trim(),
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Username updated successfully",
      });
      setIsEditing(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to update username",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <h2 className="text-xl font-semibold">User Profile</h2>
          </div>
          {isEmployee && !isEditing && (
            <Button onClick={() => setIsEditing(true)} disabled={isLoading}>
              Edit Username
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold">Email</h3>
            <p>{user.email}</p>
          </div>
          {isEmployee && (
            <div>
              <h3 className="font-semibold">Username</h3>
              {isEditing ? (
                <div className="flex gap-2 mt-2">
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    disabled={isLoading}
                  />
                  <Button 
                    onClick={handleSave} 
                    disabled={isLoading || !username.trim()}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                      setUsername(user.user_metadata?.username || '');
                    }}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <p>{user.user_metadata?.username || 'Not set'}</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}