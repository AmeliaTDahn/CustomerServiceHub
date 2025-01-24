import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import AuthPage from "@/pages/auth-page";
import NotFound from "@/pages/not-found";
import BusinessDashboard from "@/pages/business-dashboard";
import CustomerDashboard from "@/pages/customer-dashboard";
import EmployeeDashboard from "@/pages/employee-dashboard";
import BusinessProfileSetup from "@/pages/business-profile-setup";
import { useQuery } from "@tanstack/react-query";

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your workspace...</p>
      </div>
    </div>
  );
}

function Router() {
  const { user, isLoading } = useUser();

  // Check if business user has completed profile setup
  const { data: businessProfile, isLoading: profileLoading } = useQuery({
    queryKey: ['/api/business-profile'],
    enabled: user?.role === 'business',
  });

  if (isLoading || (user?.role === 'business' && profileLoading)) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <AuthPage />;
  }

  // Redirect business users to profile setup if not completed
  if (user.role === 'business' && !businessProfile) {
    return <BusinessProfileSetup />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Switch>
        <Route path="/" component={() => {
          if (user.role === "business") {
            return <BusinessDashboard />;
          } else if (user.role === "employee") {
            return <EmployeeDashboard />;
          } else {
            return <CustomerDashboard />;
          }
        }} />
        <Route path="/business/profile" component={BusinessProfileSetup} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="antialiased">
        <Router />
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}

export default App;