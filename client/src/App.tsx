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

// Protected Route component to handle auth checking
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSupabase();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) {
    window.location.href = '/';
    return null;
  }

  return <>{children}</>;
}

function Router() {
  const { user, isLoading } = useSupabase();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  return (
    <Switch>
      {/* Public routes */}
      <Route path="/" component={AuthPage} />

      {/* Protected routes */}
      <Route path="/dashboard">
        {() => (
          <ProtectedRoute>
            {user?.user_metadata.role === 'business' && <BusinessDashboard />}
            {user?.user_metadata.role === 'customer' && <CustomerDashboard />}
            {user?.user_metadata.role === 'employee' && <EmployeeMessages />}
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/messages">
        {() => (
          <ProtectedRoute>
            {user?.user_metadata.role === 'business' && <BusinessMessages />}
            {user?.user_metadata.role === 'customer' && <CustomerMessages />}
            {user?.user_metadata.role === 'employee' && <EmployeeMessages />}
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/analytics" component={() => (
        <ProtectedRoute>
          <BusinessAnalytics />
        </ProtectedRoute>
      )} />
      <Route path="/profile" component={() => (
        <ProtectedRoute>
          <BusinessProfilePage />
        </ProtectedRoute>
      )} />
      <Route path="/onboarding" component={() => (
        <ProtectedRoute>
          <EmployeeOnboarding />
        </ProtectedRoute>
      )} />

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