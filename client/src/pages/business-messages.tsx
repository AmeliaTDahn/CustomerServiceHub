import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
//import TicketChat from "@/components/ticket-chat"; // Removed as per intention
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

interface Employee {
  id: string;
  username: string;
  role: string;
  status: 'active' | 'inactive';
  unreadCount: number;
  lastMessage?: {
    content: string;
    sent_at: string;
  };
}

export default function BusinessMessages() {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const queryClient = useQueryClient();

  // Fetch all employees with their last message and unread count
  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['/api/business/employees/messages'],
    queryFn: async () => {
      if (!user?.id) {
        console.log('No user ID available');
        return [];
      }

      // First get all employees
      const { data: employees, error: employeesError } = await supabase
        .from('business_employees')
        .select(`
          employee:employee_id (
            id,
            username,
            role
          ),
          status
        `)
        .eq('business_id', user.id)
        .eq('status', 'active');

      if (employeesError) {
        console.error('Error fetching employees:', employeesError);
        throw employeesError;
      }

      // For each employee, get their last message and unread count
      const employeesWithMessages = await Promise.all((employees || []).map(async ({ employee, status }) => {
        // Get last message
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('content, sent_at')
          .or(`sender_id.eq.${employee.id},receiver_id.eq.${employee.id}`)
          .order('sent_at', { ascending: false })
          .limit(1)
          .single();

        // Get unread count
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { head: true, count: 'exact' })
          .eq('sender_id', employee.id)
          .eq('receiver_id', user.id)
          .eq('status', 'unread');

        return {
          id: employee.id,
          username: employee.username,
          role: employee.role,
          status: status,
          unreadCount: unreadCount || 0,
          lastMessage: lastMessage || undefined
        };
      }));

      return employeesWithMessages;
    },
    refetchInterval: 5000 // Poll every 5 seconds for updates
  });

  // Filter employees based on search
  const filteredEmployees = employees.filter(emp =>
    emp.username.toLowerCase().includes(employeeSearchTerm.toLowerCase())
  );

  // Subscribe to real-time updates when component mounts
  useEffect(() => {
    if (!user?.id) return;

    const messagesSubscription = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `or(sender_id.eq.${user.id},receiver_id.eq.${user.id})`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['/api/business/employees/messages'] });
        }
      )
      .subscribe();

    return () => {
      messagesSubscription.unsubscribe();
    };
  }, [user?.id, queryClient]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-2">
        <Link href="/">
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-12 gap-4 px-4 h-[calc(100vh-5rem)]">
        {/* Employee List */}
        <Card className="col-span-4 flex flex-col">
          <div className="p-4">
            <Input
              placeholder="Search employees..."
              value={employeeSearchTerm}
              onChange={(e) => setEmployeeSearchTerm(e.target.value)}
            />
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-2 p-2">
              {isLoading ? (
                <div className="p-4 text-sm text-muted-foreground">
                  Loading conversations...
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No conversations found
                </div>
              ) : (
                filteredEmployees.map((emp) => (
                  <div
                    key={emp.id}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedEmployee?.id === emp.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => setSelectedEmployee(emp)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium">{emp.username}</div>
                        {emp.lastMessage && (
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {emp.lastMessage.content}
                          </p>
                        )}
                      </div>
                      {emp.unreadCount > 0 && (
                        <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                          {emp.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Chat Area */}
        <Card className="col-span-8 flex flex-col">
          {selectedEmployee ? (
            //  Replace TicketChat with a suitable chat component for direct messages
            <div>Direct Message Component Placeholder - Replace with your implementation</div>

          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select an employee to start messaging
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}