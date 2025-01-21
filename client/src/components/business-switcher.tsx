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
  id: number;
  username: string;
}

interface BusinessSwitcherProps {
  onBusinessChange: (businessId: string) => void;
  currentBusinessId?: string;
}

export default function BusinessSwitcher({ onBusinessChange, currentBusinessId }: BusinessSwitcherProps) {
  const { data: businesses = [] } = useQuery<Business[]>({
    queryKey: ['/api/businesses'],
  });

  if (businesses.length === 0) {
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
          {businesses.map((business) => (
            <SelectItem
              key={business.id}
              value={business.id.toString()}
            >
              {business.username}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}