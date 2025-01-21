import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useSupabase } from "@/components/supabase-provider";
import { Loader2 } from "lucide-react";
import AuthPage from "@/pages/auth-page";
import CustomerDashboard from "@/pages/customer-dashboard";
import CustomerMessages from "@/pages/customer-messages";
import BusinessDashboard from "@/pages/business-dashboard";
import BusinessMessages from "@/pages/business-messages";
import NotFound from "@/pages/not-found";
import { SupabaseProvider } from "@/components/supabase-provider";

function Router() {
  const { user, profile, isLoading } = useSupabase();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If no user, show auth page regardless of profile
  if (!user) {
    return <AuthPage />;
  }

  // Show business interface for both business owners and employees
  if (profile?.role === "business" || profile?.role === "employee") {
    return (
      <Switch>
        <Route path="/" component={BusinessDashboard} />
        <Route path="/messages" component={BusinessMessages} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Customer interface
  if (profile?.role === "customer") {
    return (
      <Switch>
        <Route path="/" component={CustomerDashboard} />
        <Route path="/messages" component={CustomerMessages} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // If we have a user but no profile or invalid role, show auth page
  return <AuthPage />;
}

function App() {
  return (
    <SupabaseProvider>
      <QueryClientProvider client={queryClient}>
        <Router />
        <Toaster />
      </QueryClientProvider>
    </SupabaseProvider>
  );
}

export default App;