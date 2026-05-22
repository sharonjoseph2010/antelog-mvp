import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListItemRowProps {
  number: number;
  name: string;
  url?: string | null;
}

const ListItemRow = ({ number, name, url }: ListItemRowProps) => {
  const hasLink = !!(url && url.trim() !== "");

  const open = () => {
    if (hasLink) window.open(url as string, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 px-2 -mx-2 py-[11px]",
        "border-b border-border/60 last:border-b-0 rounded-md",
        "transition-colors duration-150",
        hasLink && "cursor-pointer hover:bg-muted/60"
      )}
      onClick={hasLink ? open : undefined}
      role={hasLink ? "link" : undefined}
      tabIndex={hasLink ? 0 : undefined}
      onKeyDown={
        hasLink
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open();
              }
            }
          : undefined
      }
    >
      <span className="text-[13px] text-muted-foreground w-[18px] flex-shrink-0">
        {number}.
      </span>
      <span
        className={cn(
          "text-sm text-foreground flex-1 break-words",
          hasLink &&
            "group-hover:underline underline-offset-[3px] decoration-muted-foreground"
        )}
      >
        {name}
      </span>
      {hasLink && (
        <ExternalLink
          strokeWidth={1.5}
          className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 [@media(hover:none)]:opacity-60"
        />
      )}
    </div>
  );
};

export default ListItemRow;