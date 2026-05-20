import { X } from "lucide-react";
import { Link } from "react-router-dom";

interface OnboardingCardProps {
  onDismiss: () => void;
}

export function OnboardingCard({ onDismiss }: OnboardingCardProps) {
  return (
    <div className="relative rounded-lg border border-border bg-muted p-3.5">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.5} />
      </button>
      <div className="text-[12px] font-medium text-foreground">New around here?</div>
      <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
        Learn how Antelog works.
      </p>
      <Link
        to="/welcome"
        className="mt-2 inline-block text-[11px] font-medium text-foreground underline-offset-4 hover:underline"
      >
        Take the tour →
      </Link>
    </div>
  );
}