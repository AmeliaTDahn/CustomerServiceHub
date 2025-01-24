import { useQuery } from "@tanstack/react-query";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import type { BusinessProfile } from "@db/schema";

interface BusinessSwitcherProps {
  onBusinessChange: (businessId: string) => void;
  currentBusinessId?: string;
}

export default function BusinessSwitcher({ onBusinessChange, currentBusinessId }: BusinessSwitcherProps) {
  // Fetch businesses where the employee has active relationships
  const { data: businesses = [] } = useQuery<BusinessProfile[]>({
    queryKey: ['/api/employees/businesses'],
    queryFn: async () => {
      const res = await fetch('/api/employees/businesses', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  if (businesses.length === 0) return null;

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
          {businesses.map((business) => (
            <SelectItem
              key={business.id}
              value={business.id.toString()}
            >
              {business.businessName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}