import { useUser } from "@/hooks/use-user";
import { Loader2 } from "lucide-react";
import EmployeeManagement from "@/components/employee-management";
import TicketList from "@/components/ticket-list";

export default function Dashboard() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Welcome, {user.username}</h1>
      
      {user.role === "business" && (
        <div className="space-y-8">
          <EmployeeManagement />
          <TicketList />
        </div>
      )}

      {user.role === "customer" && (
        <div className="space-y-8">
          <TicketList />
        </div>
      )}

      {user.role === "employee" && (
        <div className="space-y-8">
          <TicketList />
        </div>
      )}
    </div>
  );
}
