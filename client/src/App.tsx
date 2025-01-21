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
import NotFound from "@/pages/not-found";
import VerifyCode from "@/pages/verify-code";

function Router() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  // Special routes that don't require authentication
  if (window.location.pathname === "/verify-code") {
    return <VerifyCode />;
  }

  if (!user) {
    return <AuthPage />;
  }

  // Show business interface for both business owners and employees
  if (user.role === "business" || user.role === "employee") {
    return (
      <Switch>
        <Route path="/" component={BusinessDashboard} />
        <Route path="/analytics" component={BusinessAnalytics} />
        <Route path="/messages" component={BusinessMessages} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // Customer interface
  return (
    <Switch>
      <Route path="/" component={CustomerDashboard} />
      <Route path="/messages" component={CustomerMessages} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;