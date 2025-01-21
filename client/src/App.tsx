import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useSupabase } from "@/components/supabase-provider";
import { Loader2 } from "lucide-react";
import AuthPage from "@/pages/auth-page";
import CustomerDashboard from "@/pages/customer-dashboard";
import BusinessDashboard from "@/pages/business-dashboard";
import EmployeeMessages from "@/pages/employee-messages";
import NotFound from "@/pages/not-found";
import { SupabaseProvider } from "@/components/supabase-provider";

function Router() {
  const { user, isLoading } = useSupabase();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  // Route based on user role
  return (
    <Switch>
      {user.user_metadata.role === 'business' && (
        <Route path="/" component={BusinessDashboard} />
      )}
      {user.user_metadata.role === 'customer' && (
        <Route path="/" component={CustomerDashboard} />
      )}
      {user.user_metadata.role === 'employee' && (
        <Route path="/" component={EmployeeMessages} />
      )}
      <Route component={NotFound} />
    </Switch>
  );
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