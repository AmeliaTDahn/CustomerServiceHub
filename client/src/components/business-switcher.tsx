import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface Business {
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

interface BusinessSwitcherProps {
  onBusinessChange: (businessId: string) => void;
  currentBusinessId?: string;
}

export default function BusinessSwitcher({ onBusinessChange, currentBusinessId }: BusinessSwitcherProps) {
  const { data: businesses = [] } = useQuery<Business[]>({
    queryKey: ['/api/businesses/employees'],
  });

  // Filter out inactive relationships
  const activeBusinesses = businesses.filter(
    (business) => business.relation.isActive
  );

  if (activeBusinesses.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Label>Business:</Label>
      <Select
        value={currentBusinessId}
        onValueChange={onBusinessChange}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select business" />
        </SelectTrigger>
        <SelectContent>
          {activeBusinesses.map((business) => (
            <SelectItem
              key={business.relation.id}
              value={business.relation.id.toString()}
            >
              {business.employee.username}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
