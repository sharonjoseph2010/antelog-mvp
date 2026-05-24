import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "./input";

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: string;
  onChange?: (value: string | undefined) => void;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, onChange, value, ...props }, ref) => {
    // Extract just the digits from the value (remove +91 if present)
    const displayValue = value ? value.replace(/^\+91/, "").replace(/\D/g, "") : "";

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Only allow digits, max 10
      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
      // Return with +91 prefix for storage
      onChange?.(digits ? `+91${digits}` : undefined);
    };

    return (
      <div className={cn("flex items-center h-10 w-full rounded-md border border-input bg-background", className)}>
        <span className="pl-3 pr-1 text-sm text-muted-foreground font-medium">+91</span>
        <Input
          ref={ref}
          type="tel"
          value={displayValue}
          onChange={handleChange}
          placeholder="9876543210"
          className="border-0 h-full focus-visible:ring-0 focus-visible:ring-offset-0"
          maxLength={10}
          {...props}
        />
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
