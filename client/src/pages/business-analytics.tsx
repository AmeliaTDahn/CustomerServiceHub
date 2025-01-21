import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import TicketAnalytics from "@/components/ticket-analytics";
import type { Ticket } from "@db/schema";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function BusinessAnalytics() {
  const { user } = useUser();
  const { data: tickets } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets'],
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">Business Analytics</h1>
            </div>
            <span className="text-sm text-gray-500">Welcome, {user?.username}</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {tickets && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Performance Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <TicketAnalytics tickets={tickets} />
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
