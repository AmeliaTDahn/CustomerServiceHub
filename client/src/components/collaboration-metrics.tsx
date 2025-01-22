import { useQuery } from "@tanstack/react-query";
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
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Loader2 } from "lucide-react";

interface TicketMetrics {
  totalTickets: number;
  resolvedTickets: number;
  averageResolutionTime: number;
  ticketsByCategory: {
    category: string;
    count: number;
  }[];
  ticketsByPriority: {
    priority: string;
    count: number;
  }[];
}

interface FeedbackMetrics {
  averageRating: number;
  totalFeedback: number;
  ratingDistribution: {
    rating: number;
    count: number;
  }[];
  feedbackOverTime: {
    date: string;
    rating: number;
  }[];
}

interface EmployeeMetrics {
  totalActiveEmployees: number;
  ticketsPerEmployee: {
    employee: string;
    tickets: number;
  }[];
  averageResponseTime: number;
  collaborationScore: number;
}

export default function CollaborationMetrics() {
  const { data: ticketMetrics, isLoading: isLoadingTickets } = useQuery<TicketMetrics>({
    queryKey: ['/api/analytics/tickets'],
  });

  const { data: feedbackMetrics, isLoading: isLoadingFeedback } = useQuery<FeedbackMetrics>({
    queryKey: ['/api/analytics/feedback'],
  });

  const { data: employeeMetrics, isLoading: isLoadingEmployees } = useQuery<EmployeeMetrics>({
    queryKey: ['/api/analytics/employees'],
  });

  if (isLoadingTickets || isLoadingFeedback || isLoadingEmployees) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Ticket Resolution Overview */}
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Ticket Resolution Overview</CardTitle>
          <CardDescription>
            Track ticket resolution metrics across all organizations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ticketMetrics?.ticketsByCategory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="hsl(var(--primary))" name="Tickets" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Customer Satisfaction */}
      <Card className="col-span-full md:col-span-2">
        <CardHeader>
          <CardTitle>Customer Satisfaction Trends</CardTitle>
          <CardDescription>
            Average ratings over time across all organizations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={feedbackMetrics?.feedbackOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 5]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="rating"
                  stroke="hsl(var(--primary))"
                  name="Average Rating"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics Cards */}
      <Card>
        <CardHeader>
          <CardTitle>Resolution Rate</CardTitle>
          <CardDescription>Overall ticket resolution performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {ticketMetrics ? 
              `${((ticketMetrics.resolvedTickets / ticketMetrics.totalTickets) * 100).toFixed(1)}%` 
              : '0%'}
          </div>
          <p className="text-xs text-muted-foreground">
            {ticketMetrics?.resolvedTickets} out of {ticketMetrics?.totalTickets} tickets resolved
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Average Response Time</CardTitle>
          <CardDescription>Time to first response</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {employeeMetrics?.averageResponseTime 
              ? `${Math.round(employeeMetrics.averageResponseTime)}min` 
              : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground">
            Average across all organizations
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Collaboration Score</CardTitle>
          <CardDescription>Cross-organization effectiveness</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {employeeMetrics?.collaborationScore
              ? `${(employeeMetrics.collaborationScore * 100).toFixed(1)}%`
              : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground">
            Based on response times and resolution rates
          </p>
        </CardContent>
      </Card>

      {/* Employee Performance */}
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Employee Performance</CardTitle>
          <CardDescription>
            Ticket resolution distribution across employees
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={employeeMetrics?.ticketsPerEmployee}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="employee" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="tickets"
                  fill="hsl(var(--primary))"
                  name="Resolved Tickets"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
