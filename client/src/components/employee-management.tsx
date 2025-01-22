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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, X, Search, Check } from "lucide-react";

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
  id: number;
  username: string;
}

export default function EmployeeManagement() {
  const [currentEmployeeSearch, setCurrentEmployeeSearch] = useState("");
  const [existingEmployeeSearch, setExistingEmployeeSearch] = useState("");
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch employees
  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['/api/businesses/employees'],
  });

  // Fetch available employees to invite
  const { data: availableEmployees = [] } = useQuery<User[]>({
    queryKey: ['/api/employees'],
    enabled: isInviteDialogOpen,
  });

  // Send invitation mutation
  const inviteEmployee = useMutation({
    mutationFn: async (employeeId: number) => {
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

  // Filter current employees based on search term
  const filteredEmployees = employees.filter((emp) =>
    emp.employee.username.toLowerCase().includes(existingEmployeeSearch.toLowerCase())
  );

  // Filter available employees based on search term
  const filteredAvailableEmployees = availableEmployees.filter((emp) =>
    emp.username.toLowerCase().includes(currentEmployeeSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search current employees..."
            value={existingEmployeeSearch}
            onChange={(e) => setExistingEmployeeSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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
              <Command>
                <CommandInput
                  placeholder="Search employees..."
                  value={currentEmployeeSearch}
                  onValueChange={setCurrentEmployeeSearch}
                />
                <CommandEmpty>No employees found</CommandEmpty>
                <CommandGroup>
                  {filteredAvailableEmployees.map((employee) => (
                    <CommandItem
                      key={employee.id}
                      onSelect={() => {
                        inviteEmployee.mutate(employee.id);
                        setCurrentEmployeeSearch("");
                      }}
                      className="flex items-center justify-between p-2"
                    >
                      <span>{employee.username}</span>
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          inviteEmployee.mutate(employee.id);
                        }}
                        disabled={inviteEmployee.isPending}
                      >
                        Invite
                      </Button>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
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
            {filteredEmployees.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  {existingEmployeeSearch
                    ? `No employees found matching "${existingEmployeeSearch}"`
                    : "No employees yet"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}