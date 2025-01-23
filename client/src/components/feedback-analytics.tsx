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
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Star } from "lucide-react";

interface FeedbackData {
  feedback: {
    id: number;
    rating: number;
    comment: string | null;
    createdAt: string;
  };
  ticket: {
    title: string;
    createdAt: string;
  };
}

interface FeedbackAnalyticsProps {
  feedbackData: FeedbackData[];
}

export default function FeedbackAnalytics({ feedbackData }: FeedbackAnalyticsProps) {
  const stats = useMemo(() => {
    const ratings = feedbackData.map(d => d.feedback.rating);
    const totalRatings = ratings.length;
    const averageRating = totalRatings > 0 
      ? ratings.reduce((a, b) => a + b, 0) / totalRatings 
      : 0;

    const ratingDistribution = Array.from({ length: 5 }, (_, i) => ({
      rating: i + 1,
      count: ratings.filter(r => r === i + 1).length
    }));

    const withComments = feedbackData.filter(d => d.feedback.comment).length;
    const withoutComments = totalRatings - withComments;

    return {
      totalRatings,
      averageRating,
      ratingDistribution,
      commentStats: [
        { name: "With Comments", value: withComments },
        { name: "Without Comments", value: withoutComments }
      ]
    };
  }, [feedbackData]);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Customer Satisfaction Overview</CardTitle>
          <CardDescription>
            Analysis of customer feedback and ratings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{stats.totalRatings}</div>
              <div className="text-sm text-muted-foreground">Total Ratings</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">
                {stats.averageRating.toFixed(1)}
              </div>
              <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
              <div className="text-sm text-muted-foreground">Average Rating</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-2">
        <CardHeader>
          <CardTitle>Rating Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.ratingDistribution}>
                <XAxis dataKey="rating" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comment Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.commentStats}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {stats.commentStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-full">
        <CardHeader>
          <CardTitle>Recent Feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {feedbackData
              .filter(d => d.feedback.comment)
              .sort((a, b) => 
                new Date(b.feedback.createdAt).getTime() - 
                new Date(a.feedback.createdAt).getTime()
              )
              .slice(0, 5)
              .map(d => (
                <div key={d.feedback.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{d.ticket.title}</h4>
                    <div className="flex items-center">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span className="ml-1">{d.feedback.rating}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{d.feedback.comment}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(d.feedback.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}