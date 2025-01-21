import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        // Get the token from the URL
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get("access_token");
        const type = params.get("type");

        if (!token || type !== "signup") {
          setStatus("error");
          setErrorMessage("Invalid verification link");
          return;
        }

        // Set the access token to verify the email
        const { error } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: "signup",
        });

        if (error) {
          throw error;
        }

        setStatus("success");
      } catch (error) {
        console.error("Verification error:", error);
        setStatus("error");
        setErrorMessage((error as Error).message);
      }
    };

    verifyEmail();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Email Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === "verifying" && (
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p>Verifying your email address...</p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4">
              <p className="text-green-600">Email verified successfully!</p>
              <Button
                className="w-full"
                onClick={() => setLocation("/")}
              >
                Continue to Login
              </Button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-4">
              <p className="text-red-600">
                {errorMessage || "Failed to verify email. Please try again."}
              </p>
              <Button
                className="w-full"
                onClick={() => setLocation("/")}
              >
                Back to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
