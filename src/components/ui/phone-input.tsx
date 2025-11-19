import * as React from "react";
import PhoneInputWithCountry from "react-phone-number-input";
import { cn } from "@/lib/utils";

export interface PhoneInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: string;
  onChange?: (value: string | undefined) => void;
}

const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ className, onChange, value, ...props }, ref) => {
    return (
      <div className={cn("relative", className)}>
        <PhoneInputWithCountry
          international
          defaultCountry="IN"
          value={value}
          onChange={onChange}
          className="flex h-10 w-full rounded-md border border-input bg-background"
          numberInputProps={{
            className: "flex-1 h-full px-3 py-2 text-base bg-transparent outline-none placeholder:text-muted-foreground md:text-sm disabled:cursor-not-allowed disabled:opacity-50",
            ...props,
          }}
        />
      </div>
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
