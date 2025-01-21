import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { BarChart, Star, Users, MessageSquare, ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import {
  Bar,
  BarChart as RechartsBarChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface FeedbackData {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  ticketTitle: string;
  customerName: string;
}

interface AnalyticsData {
  feedback: FeedbackData[];
  stats: {
    averageRating: number;
    totalFeedback: number;
    ratingCounts: Record<string, number>;
  };
}

export default function BusinessAnalytics() {
  const { user } = useUser();
  const { data: analyticsData } = useQuery<AnalyticsData>({
    queryKey: ['/api/analytics/feedback'],
  });

  const chartData = analyticsData?.stats?.ratingCounts
    ? Object.entries(analyticsData.stats.ratingCounts).map(([rating, count]) => ({
        rating: `${rating} Stars`,
        count,
      }))
    : [];

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
        {analyticsData && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
                  <Star className="h-4 w-4 text-yellow-400" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analyticsData.stats.averageRating}</div>
                  <p className="text-xs text-muted-foreground">
                    out of 5 stars
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{analyticsData.stats.totalFeedback}</div>
                  <p className="text-xs text-muted-foreground">
                    customer reviews
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Unique Customers</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {new Set(analyticsData.feedback.map(f => f.customerName)).size}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    provided feedback
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Ratings Distribution Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Rating Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={chartData}>
                      <XAxis dataKey="rating" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Feedback List */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {analyticsData.feedback.map((feedback) => (
                      <Card key={feedback.id}>
                        <CardContent className="pt-6">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-semibold">{feedback.ticketTitle}</h3>
                              <p className="text-sm text-muted-foreground">
                                by {feedback.customerName} on{" "}
                                {new Date(feedback.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center">
                              <span className="font-bold mr-1">{feedback.rating}</span>
                              <Star className="h-4 w-4 text-yellow-400" />
                            </div>
                          </div>
                          {feedback.comment && (
                            <p className="mt-2 text-sm">{feedback.comment}</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}