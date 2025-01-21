import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useSupabase } from "@/components/supabase-provider";
import { Building2, Briefcase, User, Loader2 } from "lucide-react";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"business" | "customer" | "employee">("customer");
  const { signIn, signUp } = useSupabase();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
        toast({
          title: "Welcome back!",
          description: "You've successfully logged in.",
        });
        setLocation('/dashboard');
      } else {
        await signUp(email, password, role);
        toast({
          title: "Account created",
          description: role === "employee" 
            ? "Your account has been created. Wait for a business to invite you."
            : "Your account has been created successfully.",
          duration: 5000,
        });
        setLocation('/dashboard');
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            {isLogin ? "Welcome back" : "Create an account"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isLogin
              ? "Enter your credentials to access your account"
              : "Choose your account type and sign up"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label>Account Type</Label>
                <RadioGroup
                  value={role}
                  onValueChange={(value) => setRole(value as "business" | "customer" | "employee")}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-3"
                >
                  <div className="flex items-center space-x-2 rounded-lg border p-4 cursor-pointer hover:bg-gray-50">
                    <RadioGroupItem value="customer" id="customer" />
                    <Label htmlFor="customer" className="flex items-center gap-2 cursor-pointer">
                      <User className="h-4 w-4" />
                      <span>Customer</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 rounded-lg border p-4 cursor-pointer hover:bg-gray-50">
                    <RadioGroupItem value="business" id="business" />
                    <Label htmlFor="business" className="flex items-center gap-2 cursor-pointer">
                      <Building2 className="h-4 w-4" />
                      <span>Business</span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 rounded-lg border p-4 cursor-pointer hover:bg-gray-50">
                    <RadioGroupItem value="employee" id="employee" />
                    <Label htmlFor="employee" className="flex items-center gap-2 cursor-pointer">
                      <Briefcase className="h-4 w-4" />
                      <span>Employee</span>
                    </Label>
                  </div>
                </RadioGroup>
                {role === "employee" && (
                  <p className="text-sm text-muted-foreground mt-2">
                    After registration, wait for a business to invite you to their support system.
                  </p>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isLogin ? "Signing in..." : "Creating account..."}
                </>
              ) : (
                <>{isLogin ? "Sign In" : "Create Account"}</>
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <Button
              variant="link"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm"
              disabled={isLoading}
            >
              {isLogin
                ? "Don't have an account? Create one"
                : "Already have an account? Sign in"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}