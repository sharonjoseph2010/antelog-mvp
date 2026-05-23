import { differenceInDays, differenceInHours, format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

interface ExpiryBadgeProps {
  expiresAt: string;
  status: string;
}

export function ExpiryBadge({ expiresAt, status }: ExpiryBadgeProps) {
  if (status === "closed") return null;

  const now = new Date();
  const expiry = new Date(expiresAt);
  const daysLeft = differenceInDays(expiry, now);
  const hoursLeft = differenceInHours(expiry, now);

  if (now > expiry) {
    return (
      <Badge
        variant="outline"
        className="text-xs flex items-center gap-1"
        style={{
          backgroundColor: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.35)",
          color: "rgb(160,100,0)",
        }}
      >
        <Clock className="h-3 w-3" />
        Expired — awaiting creator action
      </Badge>
    );
  }

  if (daysLeft === 0) {
    return (
      <Badge className="text-xs flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
        <Clock className="h-3 w-3" />
        {hoursLeft <= 0 ? "Expires today" : `Expires in ${hoursLeft}h`}
      </Badge>
    );
  }

  if (daysLeft === 1) {
    return (
      <Badge className="text-xs flex items-center gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
        <Clock className="h-3 w-3" />
        Expires tomorrow
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs flex items-center gap-1">
      <Clock className="h-3 w-3" />
      Expires in {daysLeft} days
    </Badge>
  );
}

export function isRequestExpired(expiresAt: string, status: string): boolean {
  if (status === "closed") return false;
  return new Date() > new Date(expiresAt);
}
