import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EXPIRY_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
];

interface ExpiryDurationPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function ExpiryDurationPicker({ value, onChange, label = "Close request after" }: ExpiryDurationPickerProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EXPIRY_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        After this period, no new responses can be submitted. You can extend or close the request later.
      </p>
    </div>
  );
}
