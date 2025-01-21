import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { SupabaseProvider } from "@/components/supabase-provider";

// Basic router component
function Router() {
  return (
    <Switch>
      {/* Add routes here after we confirm app loads */}
      <Route path="/">
        <div className="min-h-screen flex items-center justify-center bg-background">
          <h1 className="text-2xl font-bold">App is loading!</h1>
        </div>
      </Route>
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