import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, User2 } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

interface NetworkPathProps {
  forwardingChain?: Array<{
    user_id: string;
    user_name: string;
    user_handle: string;
  }>;
  degreeOfSeparation?: number | null;
  connectionPath?: string[];
}

export function NetworkPath({ 
  forwardingChain = [], 
  degreeOfSeparation,
  connectionPath = []
}: NetworkPathProps) {
  if (forwardingChain.length === 0 && !degreeOfSeparation && connectionPath.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Forwarding Chain Display - Shows the sharing path */}
      {forwardingChain.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap p-2 rounded-md bg-muted/50 border">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <User2 className="h-3 w-3" />
            Shared by:
          </span>
          {forwardingChain.map((user, index) => (
            <div key={user.user_id} className="flex items-center">
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Link 
                    to={`/profile/${user.user_handle}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {user.user_name}
                  </Link>
                </HoverCardTrigger>
                <HoverCardContent className="w-64">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">{user.user_name}</h4>
                    <p className="text-xs text-muted-foreground">@{user.user_handle}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Forwarded this request to help expand its reach
                    </p>
                  </div>
                </HoverCardContent>
              </HoverCard>
              {index < forwardingChain.length - 1 && (
                <ChevronRight className="h-3 w-3 mx-1 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Connection Path and Degree Display - Shows how you're connected */}
      {(connectionPath.length > 0 || degreeOfSeparation) && (
        <div className="flex items-center gap-2 flex-wrap">
          {/* Degree Badge */}
          {degreeOfSeparation !== null && degreeOfSeparation !== undefined && degreeOfSeparation > 0 && (
            <Badge variant="secondary" className="text-xs">
              {degreeOfSeparation === 1 ? "Direct Friend" : `${degreeOfSeparation}${degreeOfSeparation === 2 ? "nd" : degreeOfSeparation === 3 ? "rd" : "th"} Degree`}
            </Badge>
          )}

          {/* Connection Path */}
          {connectionPath.length > 1 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>via</span>
              {connectionPath.slice(1, -1).map((name, index) => (
                <div key={index} className="flex items-center">
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <button className="font-medium text-primary hover:underline">
                        {name}
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-64">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold">{name}</h4>
                        <p className="text-xs text-muted-foreground">
                          Mutual connection
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                  {index < connectionPath.length - 3 && (
                    <ChevronRight className="h-3 w-3 mx-1" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}