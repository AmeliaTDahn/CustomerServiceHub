import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface TicketFiltersProps {
  onSearchChange: (search: string) => void;
  onStatusChange: (status: string) => void;
  onCategoryChange: (category: string) => void;
}

const STATUSES = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "technical", label: "Technical Issue" },
  { value: "billing", label: "Billing Problem" },
  { value: "feature_request", label: "Feature Request" },
  { value: "general_inquiry", label: "General Inquiry" },
  { value: "bug_report", label: "Bug Report" },
];

export default function TicketFilters({
  onSearchChange,
  onStatusChange,
  onCategoryChange,
}: TicketFiltersProps) {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-4 mb-6">
      <div className="space-y-2">
        <Label htmlFor="search">Search Tickets</Label>
        <Input
          id="search"
          placeholder="Search by title or description..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            onSearchChange(e.target.value);
          }}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select onValueChange={onStatusChange} defaultValue="all">
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select onValueChange={onCategoryChange} defaultValue="all">
            <SelectTrigger>
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((category) => (
                <SelectItem key={category.value} value={category.value}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
