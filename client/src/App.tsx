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
import EmployeeMessages from "@/pages/employee-messages";
import BusinessProfileSetup from "@/pages/business-profile-setup";

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

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <AuthPage />;
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
        <Route path="/messages" component={EmployeeMessages} />
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