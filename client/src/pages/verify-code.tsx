import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/hooks/use-user";

export default function VerifyCode() {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState(() => {
    // Try to get email from URL params
    const params = new URLSearchParams(window.location.search);
    return params.get("email") || "";
  });
  const { verifyOtp } = useUser();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const result = await verifyOtp({
        email,
        token: code
      });

      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "Verification failed",
          description: result.message
        });
        return;
      }

      toast({
        title: "Success",
        description: "Your email has been verified. You can now log in.",
      });

      // Redirect to home page
      setLocation("/");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Enter Verification Code</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Verification Code</label>
              <Input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                placeholder="Enter the code from your email"
              />
            </div>
            <Button type="submit" className="w-full">
              Verify Email
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
