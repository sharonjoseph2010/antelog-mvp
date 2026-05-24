import { differenceInDays, differenceInHours, format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Clock, Hourglass } from "lucide-react";

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

  const label =
    daysLeft === 0
      ? hoursLeft <= 0
        ? "Expires today"
        : `Expires in ${hoursLeft}h`
      : daysLeft === 1
      ? "Expires tomorrow"
      : `Expires in ${daysLeft} days`;

  return (
    <span
      className="text-xs inline-flex items-center gap-1"
      style={{
        backgroundColor: "rgba(56,189,248,0.08)",
        border: "0.5px solid rgba(56,189,248,0.35)",
        borderRadius: 999,
        color: "rgb(10,100,150)",
        padding: "2px 10px",
        lineHeight: 1.4,
      }}
    >
      <Hourglass className="h-3 w-3" />
      {label}
    </span>
  );
}

export function isRequestExpired(expiresAt: string, status: string): boolean {
  if (status === "closed") return false;
  return new Date() > new Date(expiresAt);
}
