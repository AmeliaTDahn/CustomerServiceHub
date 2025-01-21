import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import BusinessSwitcher from "@/components/business-switcher";
import { useUser } from "@/hooks/use-user";
import { MessageCircle } from "lucide-react";
import { Link } from "wouter";

export default function EmployeeMessages() {
  const { user, logout } = useUser();
  const [currentBusinessId, setCurrentBusinessId] = useState<string>();

  // For employees, fetch the first available business ID if none is selected
  const { data: businesses = [] } = useQuery<Array<{ id: number; username: string }>>({
    queryKey: ['/api/businesses'],
  });

  useEffect(() => {
    if (!currentBusinessId && businesses.length > 0) {
      setCurrentBusinessId(businesses[0].id.toString());
    }
  }, [currentBusinessId, businesses]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold text-gray-900">Support Messages</h1>
            <BusinessSwitcher
              onBusinessChange={setCurrentBusinessId}
              currentBusinessId={currentBusinessId}
            />
          </div>
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4" />
                Dashboard
              </Button>
            </Link>
            <span className="text-sm text-gray-500">Welcome, {user?.username}</span>
            <Button variant="outline" onClick={() => logout()}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {!currentBusinessId && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-muted-foreground">
                Please select a business to view messages
              </p>
            </CardContent>
          </Card>
        )}

        {currentBusinessId && (
          <Card>
            <CardHeader>
              <CardTitle>Customer Conversations</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Add the chat interface component here */}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}