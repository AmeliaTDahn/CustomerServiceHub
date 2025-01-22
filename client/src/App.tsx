import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import AuthPage from "@/pages/auth-page";
import CustomerDashboard from "@/pages/customer-dashboard";
import CustomerMessages from "@/pages/customer-messages";
import BusinessDashboard from "@/pages/business-dashboard";
import BusinessAnalytics from "@/pages/business-analytics";
import BusinessMessages from "@/pages/business-messages";
import EmployeeDashboard from "@/pages/employee-dashboard";
import EmployeeMessages from "@/pages/employee-messages";
import NotFound from "@/pages/not-found";

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

  if (user.role === "business") {
    return (
      <div className="min-h-screen bg-background">
        <Switch>
          <Route path="/" component={BusinessDashboard} />
          <Route path="/analytics" component={BusinessAnalytics} />
          <Route path="/messages" component={BusinessMessages} />
          <Route component={NotFound} />
        </Switch>
      </div>
    );
  }

  if (user.role === "employee") {
    return (
      <div className="min-h-screen bg-background">
        <Switch>
          <Route path="/" component={EmployeeDashboard} />
          <Route path="/messages" component={EmployeeMessages} />
          <Route component={NotFound} />
        </Switch>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Switch>
        <Route path="/" component={CustomerDashboard} />
        <Route path="/messages" component={CustomerMessages} />
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