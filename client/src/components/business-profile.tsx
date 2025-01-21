import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Building2 } from "lucide-react";
import { useSupabase } from "@/components/supabase-provider";

interface BusinessProfile {
  company_name: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
}

export default function BusinessProfile() {
  const { user } = useSupabase();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile>({
    company_name: null,
    description: null,
    website: null,
    phone: null,
    address: null,
  });

  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('company_name, description, website, phone, address')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to load business profile",
          });
          return;
        }

        if (data) {
          setProfile({
            company_name: data.company_name,
            description: data.description,
            website: data.website,
            phone: data.phone,
            address: data.address,
          });
        }
      } catch (err) {
        console.error('Error in fetchProfile:', err);
        toast({
          variant: "destructive",
          title: "Error",
          description: "An unexpected error occurred while loading the profile",
        });
      }
    }

    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          company_name: profile.company_name,
          description: profile.description,
          website: profile.website,
          phone: profile.phone,
          address: profile.address,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error updating profile:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: `Failed to update business profile: ${error.message}`,
        });
        return;
      }

      toast({
        title: "Success",
        description: "Business profile updated successfully",
      });
      setIsEditing(false);
    } catch (err) {
      console.error('Error in handleSave:', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred while saving the profile",
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
            <Building2 className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Business Profile</h2>
          </div>
          {!isEditing && (
            <Button onClick={() => setIsEditing(true)} disabled={isLoading}>
              Edit Profile
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="company_name">Company Name</Label>
            {isEditing ? (
              <Input
                id="company_name"
                value={profile.company_name || ""}
                onChange={(e) =>
                  setProfile({ ...profile, company_name: e.target.value })
                }
                placeholder="Enter your company name"
                disabled={isLoading}
              />
            ) : (
              <p className="mt-1">{profile.company_name || "Not set"}</p>
            )}
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            {isEditing ? (
              <Textarea
                id="description"
                value={profile.description || ""}
                onChange={(e) =>
                  setProfile({ ...profile, description: e.target.value })
                }
                placeholder="Describe your business"
                disabled={isLoading}
              />
            ) : (
              <p className="mt-1">{profile.description || "Not set"}</p>
            )}
          </div>

          <div>
            <Label htmlFor="website">Website</Label>
            {isEditing ? (
              <Input
                id="website"
                value={profile.website || ""}
                onChange={(e) =>
                  setProfile({ ...profile, website: e.target.value })
                }
                placeholder="https://example.com"
                disabled={isLoading}
              />
            ) : (
              <p className="mt-1">{profile.website || "Not set"}</p>
            )}
          </div>

          <div>
            <Label htmlFor="phone">Phone Number</Label>
            {isEditing ? (
              <Input
                id="phone"
                value={profile.phone || ""}
                onChange={(e) =>
                  setProfile({ ...profile, phone: e.target.value })
                }
                placeholder="+1 (555) 555-5555"
                disabled={isLoading}
              />
            ) : (
              <p className="mt-1">{profile.phone || "Not set"}</p>
            )}
          </div>

          <div>
            <Label htmlFor="address">Business Address</Label>
            {isEditing ? (
              <Input
                id="address"
                value={profile.address || ""}
                onChange={(e) =>
                  setProfile({ ...profile, address: e.target.value })
                }
                placeholder="123 Business St, City, State, ZIP"
                disabled={isLoading}
              />
            ) : (
              <p className="mt-1">{profile.address || "Not set"}</p>
            )}
          </div>

          {isEditing && (
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}