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
import TicketChat from "@/components/ticket-chat";

interface Employee {
  employee: {
    id: number;
    username: string;
  };
  relation: {
    id: number;
    isActive: boolean;
  };
}

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  status: 'sent' | 'delivered' | 'read';
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
  createdAt: string;
}

export default function BusinessMessages() {
  const { user } = useUser();
  const { toast } = useToast();
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch all employees for this business
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/businesses/employees'],
  });

  // Fetch messages for selected employee
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['/api/messages', selectedEmployee?.employee.id],
    enabled: !!selectedEmployee,
  });

  const filteredEmployees = employees.filter(emp =>
    emp.employee.username.toLowerCase().includes(employeeSearchTerm.toLowerCase())
  );

  // Force refresh when component mounts
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/businesses/employees'] });
  }, [queryClient]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // WebSocket setup
  useEffect(() => {
    if (!user) return;

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}?userId=${user.id}&role=${user.role}`;
        const wsInstance = new WebSocket(wsUrl);

        wsInstance.onopen = () => {
          toast({
            title: "Connected",
            description: "Message connection established",
          });
        };

        wsInstance.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Handle connection status message
            if (data.type === 'connection') {
              return;
            }

            // Handle error message
            if (data.error) {
              toast({
                variant: "destructive",
                title: "Error",
                description: data.error,
              });
              return;
            }

            // Handle regular message - update messages if it's from/to current selected employee
            if (selectedEmployee && 
                (data.senderId === selectedEmployee.employee.id || 
                 data.receiverId === selectedEmployee.employee.id)) {
              queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedEmployee.employee.id] });
            }
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

        wsInstance.onerror = (error) => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Connection error. Attempting to reconnect...",
          });
        };

        wsInstance.onclose = () => {
          setWs(null);
          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
        };

        setWs(wsInstance);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to setup chat connection. Retrying...",
        });
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [user?.id]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedEmployee || !user || !ws || ws.readyState !== WebSocket.OPEN) return;

    const message = {
      type: "message",
      senderId: user.id,
      receiverId: selectedEmployee.employee.id,
      content: newMessage.trim(),
      timestamp: new Date().toISOString()
    };

    try {
      ws.send(JSON.stringify(message));
      setNewMessage("");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to send message. Please try again.",
      });
    }
  };

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
              {filteredEmployees.map((emp) => (
                <div
                  key={emp.employee.id}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedEmployee?.employee.id === emp.employee.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                  onClick={() => setSelectedEmployee(emp)}
                >
                  <div className="font-medium">{emp.employee.username}</div>
                  <div className="text-sm text-muted-foreground">
                    {emp.relation.isActive ? "Active" : "Inactive"}
                  </div>
                </div>
              ))}
              {filteredEmployees.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">
                  No employees found
                </div>
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Chat Area */}
        <Card className="col-span-8 flex flex-col">
          {selectedEmployee ? (
            <TicketChat
              directMessageUserId={selectedEmployee.employee.id}
              chatType="business"
              readonly={false}
            />
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