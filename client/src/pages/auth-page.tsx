import { useState } from "react";
import { useUser } from "@/hooks/use-user";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"business" | "customer" | "employee">("customer");
  const [authMethod, setAuthMethod] = useState<"email" | "phone">("email");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const { login, register, verifyRegistration, deleteAccount, user } = useUser();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const identifier = authMethod === "email" ? email : phone;

      if (isLogin) {
        const result = await login({ identifier, password, authMethod });
        if (!result.ok) {
          toast({
            variant: "destructive",
            title: "Login failed",
            description: result.message,
          });
        }
      } else {
        const result = await register({ identifier, password, role, authMethod });
        if (!result.ok) {
          toast({
            variant: "destructive",
            title: "Registration failed",
            description: result.message,
          });
          return;
        }

        setShowVerification(true);
        toast({
          title: "Verification Required",
          description: `Please enter the verification code sent to your ${authMethod === "email" ? "email" : "phone"}.`,
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    }
  };

  const handleVerification = async () => {
    try {
      const identifier = authMethod === "email" ? email : phone;
      const result = await verifyRegistration({ identifier, code: verificationCode, authMethod });

      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "Verification failed",
          description: result.message,
        });
        return;
      }

      setShowVerification(false);
      if (role === "employee") {
        toast({
          title: "Registration successful",
          description: "Your account has been created. Wait for a business to invite you to their support system.",
          duration: 5000,
        });
      } else {
        toast({
          title: "Registration successful",
          description: "Your account has been created successfully.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const result = await deleteAccount();
      if (!result.ok) {
        toast({
          variant: "destructive",
          title: "Failed to delete account",
          description: result.message,
        });
        return;
      }

      toast({
        title: "Account deleted",
        description: "Your account has been successfully deleted.",
      });
      setShowDeleteConfirm(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">
            {isLogin ? "Login" : "Create an account"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isLogin
              ? "Enter your credentials to access your account"
              : "Sign up for a new account"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Tabs value={authMethod} onValueChange={(v) => setAuthMethod(v as "email" | "phone")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="phone">Phone</TabsTrigger>
              </TabsList>
              <TabsContent value="email">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required={authMethod === "email"}
                  />
                </div>
              </TabsContent>
              <TabsContent value="phone">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+1234567890"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required={authMethod === "phone"}
                  />
                </div>
              </TabsContent>
            </Tabs>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {!isLogin && (
              <div className="space-y-2">
                <Label>Account Type</Label>
                <RadioGroup
                  value={role}
                  onValueChange={(value) => setRole(value as "business" | "customer" | "employee")}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="customer" id="customer" />
                    <Label htmlFor="customer">Customer</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="business" id="business" />
                    <Label htmlFor="business">Business</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="employee" id="employee" />
                    <Label htmlFor="employee">Employee</Label>
                  </div>
                </RadioGroup>
                {role === "employee" && (
                  <p className="text-sm text-muted-foreground mt-2">
                    After registration, wait for a business to invite you to their support system.
                  </p>
                )}
              </div>
            )}
            <Button type="submit" className="w-full">
              {isLogin ? "Login" : "Register"}
            </Button>
          </form>
          <div className="mt-4 text-center space-y-2">
            <Button
              variant="link"
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm"
            >
              {isLogin
                ? "Don't have an account? Register"
                : "Already have an account? Login"}
            </Button>
            {user && (
              <div>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="mt-4"
                >
                  Delete Account
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showVerification} onOpenChange={setShowVerification}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Your Account</DialogTitle>
            <DialogDescription>
              Enter the verification code sent to your {authMethod === "email" ? "email" : "phone"}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <InputOTP
              maxLength={6}
              value={verificationCode}
              onChange={(value) => setVerificationCode(value)}
              render={({ slots }) => (
                <InputOTPGroup>
                  {slots.map((slot, index) => (
                    <InputOTPSlot key={index} {...slot} />
                  ))}
                </InputOTPGroup>
              )}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleVerification} className="w-full">
              Verify Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete your account? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount}>
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}