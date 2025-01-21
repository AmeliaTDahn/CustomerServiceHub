import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useSupabase } from "@/components/supabase-provider";
import { UserPlus, X } from "lucide-react";

interface Employee {
  employee: {
    id: number;
    username: string;
    role: string;
  };
  relation: {
    id: number;
    isActive: boolean;
  };
}

interface User {
  id: string;
  username: string;
  role: string;
}

export default function EmployeeManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { supabase } = useSupabase();

  // Fetch employees
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/businesses/employees'],
  });

  // Fetch available employees to invite based on search term
  const { data: availableEmployees = [] } = useQuery<User[]>({
    queryKey: ['/api/employees', searchTerm],
    queryFn: async () => {
      if (!searchTerm.trim()) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, role')
        .eq('role', 'employee')
        .ilike('username', `%${searchTerm}%`)
        .limit(10);

      if (error) throw error;
      return data;
    },
    enabled: isInviteDialogOpen && !!searchTerm.trim(),
  });

  // Send invitation mutation
  const inviteEmployee = useMutation({
    mutationFn: async (employeeId: string) => {
      const res = await fetch(`/api/businesses/employees/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId }),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to invite employee");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/businesses/employees'] });
      setIsInviteDialogOpen(false);
      toast({
        title: "Success",
        description: "Invitation sent successfully",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    },
  });

  // Remove employee mutation
  const removeEmployee = useMutation({
    mutationFn: async (employeeId: number) => {
      const res = await fetch(`/api/businesses/employees/${employeeId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to remove employee");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/businesses/employees'] });
      toast({
        title: "Success",
        description: "Employee removed successfully",
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: (error as Error).message,
      });
    },
  });

  const filteredEmployees = employees.filter((emp) =>
    emp.employee.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          placeholder="Search employees..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Invite Employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Employee</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Input
                  placeholder="Search employees by username..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <p className="text-sm text-muted-foreground mt-2">
                  Enter a username to search for employees
                </p>
              </div>

              {availableEmployees.length > 0 ? (
                availableEmployees.map((employee) => (
                  <div
                    key={employee.id}
                    className="flex items-center justify-between p-2 rounded-lg border"
                  >
                    <span>{employee.username}</span>
                    <Button
                      size="sm"
                      onClick={() => inviteEmployee.mutate(employee.id)}
                      disabled={inviteEmployee.isPending}
                    >
                      Invite
                    </Button>
                  </div>
                ))
              ) : searchTerm.trim() ? (
                <p className="text-sm text-muted-foreground">
                  No employees found with that username
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Start typing to search for employees
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.map(({ employee, relation }) => (
              <TableRow key={employee.id}>
                <TableCell>{employee.username}</TableCell>
                <TableCell>
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      relation.isActive
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {relation.isActive ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEmployee.mutate(employee.id)}
                    disabled={removeEmployee.isPending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}