import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Ticket } from "@db/schema";

interface TicketAnalyticsProps {
  tickets: Ticket[];
}

// Helper function to format category names
const formatCategory = (category: string) => {
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export default function TicketAnalytics({ tickets }: TicketAnalyticsProps) {
  const analytics = useMemo(() => {
    const categoryCount: Record<string, number> = {};
    const categoryResolutionTimes: Record<string, number[]> = {};

    tickets.forEach((ticket) => {
      // Count categories
      categoryCount[ticket.category] = (categoryCount[ticket.category] || 0) + 1;

      // Calculate resolution time for resolved tickets
      if (ticket.status === "resolved") {
        const createdAt = new Date(ticket.createdAt);
        const updatedAt = new Date(ticket.updatedAt);
        const resolutionTime = updatedAt.getTime() - createdAt.getTime();
        const resolutionHours = resolutionTime / (1000 * 60 * 60); // Convert to hours

        if (!categoryResolutionTimes[ticket.category]) {
          categoryResolutionTimes[ticket.category] = [];
        }
        categoryResolutionTimes[ticket.category].push(resolutionHours);
      }
    });

    // Calculate average resolution time per category
    const averageResolutionTimes = Object.entries(categoryResolutionTimes).map(
      ([category, times]) => ({
        category: formatCategory(category),
        avgResolutionTime: times.length
          ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
          : 0,
      })
    );

    // Format category data for the bar chart
    const categoryData = Object.entries(categoryCount).map(([category, count]) => ({
      category: formatCategory(category),
      count,
    }));

    return {
      totalTickets: tickets.length,
      resolvedTickets: tickets.filter((t) => t.status === "resolved").length,
      openTickets: tickets.filter((t) => t.status === "open").length,
      inProgressTickets: tickets.filter((t) => t.status === "in_progress").length,
      categoryData,
      averageResolutionTimes,
    };
  }, [tickets]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.totalTickets}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Resolved Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.resolvedTickets}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.openTickets}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">In Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{analytics.inProgressTickets}</div>
        </CardContent>
      </Card>

      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Ticket Categories</CardTitle>
          <CardDescription>
            Distribution of tickets across different categories
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.categoryData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Average Resolution Time</CardTitle>
          <CardDescription>
            Average time to resolve tickets by category (hours)
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.averageResolutionTimes}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="category" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="avgResolutionTime" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}