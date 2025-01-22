import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import CollaborationMetrics from "@/components/collaboration-metrics";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function BusinessAnalytics() {
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center">
          <div className="flex flex-1 items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-xl font-semibold">Cross-Organization Analytics</h1>
            </div>
            <span className="text-sm text-muted-foreground">
              Welcome, {user?.username}
            </span>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        <CollaborationMetrics />
      </main>
    </div>
  );
}