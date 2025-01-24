
import { useQuery } from "@tanstack/react-query";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

interface BusinessSwitcherProps {
  onBusinessChange: (businessId: string) => void;
  currentBusinessId?: string;
}

export default function BusinessSwitcher({ onBusinessChange, currentBusinessId }: BusinessSwitcherProps) {
  // Fetch businesses where the employee has active relationships
  const { data: connections = [] } = useQuery({
    queryKey: ['/api/employees/active-businesses'],
    queryFn: async () => {
      const res = await fetch('/api/employees/active-businesses', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const businesses = connections.map(conn => conn.business);

  return (
    <div className="flex items-center gap-2">
      <Label>Business:</Label>
      {businesses.length === 0 ? (
        <div className="text-sm text-muted-foreground">No businesses available. Accept invitations to see businesses here.</div>
      ) : (
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
      )}
      {businesses.length > 0 && (
        <div className="text-sm text-muted-foreground ml-4">
          Connected to: {businesses.map(b => b.businessName).join(', ')}
        </div>
      )}
    </div>
  );
}
