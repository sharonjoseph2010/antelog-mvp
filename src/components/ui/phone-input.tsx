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
      <PhoneInputWithCountry
        international
        defaultCountry="IN"
        value={value}
        onChange={onChange}
        className={cn("flex items-center h-10 w-full rounded-md border border-input bg-background px-3", className)}
        numberInputProps={{
          className: "flex-1 h-full text-base bg-transparent outline-none placeholder:text-muted-foreground md:text-sm disabled:cursor-not-allowed disabled:opacity-50 border-none focus:outline-none focus:ring-0",
          ...props,
        }}
      />
    );
  }
);

PhoneInput.displayName = "PhoneInput";

export { PhoneInput };
